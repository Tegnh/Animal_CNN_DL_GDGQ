'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LOAD_TIMEOUT_MS, type LoadPhase, loadModel, ModelLoadError, runModel, topK } from '@/lib/ort';
import { INPUT_SIZE, preprocess, UnsupportedImageError } from '@/lib/preprocess';
import { type ClientModel, MODEL_INFO, type ModelKey, type Sample } from '@/lib/types';
import styles from './Classifier.module.css';

interface Props {
  models: ClientModel[];
  labels: string[];
  names: Record<string, string>;
  samples: Sample[];
  maxUploadMb: number;
}

interface LoadState {
  status: 'waiting' | 'loading' | 'ready' | 'error';
  phase: LoadPhase;
  fraction: number;
  message?: string;
  detail?: string;
}

/** What went wrong, in plain Arabic, plus the technical detail for the curious. */
function explain(cause: unknown): { message: string; detail: string } {
  const detail = cause instanceof Error ? cause.message || cause.name : String(cause);
  if (cause instanceof ModelLoadError) {
    if (cause.kind === 'timeout') {
      return {
        message: `انتهت مهلة التحميل: لم تصل أي بيانات خلال ${LOAD_TIMEOUT_MS / 1000} ثانية. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.`,
        detail,
      };
    }
    if (cause.kind === 'network') {
      return { message: 'تعذّر تحميل ملف النموذج. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.', detail };
    }
    if (cause.kind === 'unsupported') {
      return {
        message: 'هذا المتصفح لا يدعم WebAssembly SIMD الذي يحتاجه تشغيل النموذجين. على iPhone يلزم iOS 16.4 أو أحدث.',
        detail,
      };
    }
    return {
      message: 'تعذّر تجهيز النموذج للتشغيل في هذا المتصفح. أعد تحميل الصفحة، وإن تكرّر الخطأ فجرّب متصفحًا آخر.',
      detail,
    };
  }
  return { message: 'حدث خطأ غير متوقع أثناء تحميل النموذج. أعد المحاولة.', detail };
}

const IMAGE_NAME = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

interface Step {
  id: string;
  label: React.ReactNode;
  state: 'todo' | 'doing' | 'done';
  detail?: string;
  ms?: number;
}

interface Verdict {
  top: { index: number; prob: number }[];
  unknown: boolean;
  label: string;
  ms: number;
}

interface Result {
  verdicts: Record<ModelKey, Verdict>;
  truth: string | null;
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const ms = (value: number) => `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;
const Ltr = ({ children }: { children: React.ReactNode }) => <bdi dir="ltr">{children}</bdi>;

// Lets the browser paint the step that just started before the heavy work blocks it.
const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const initialSteps = (): Step[] => [
  { id: 'decode', label: 'قراءة الصورة وتصحيح اتجاهها', state: 'todo' },
  { id: 'shrink', label: 'تصغير الضلع الأطول إلى 384 بكسل', state: 'todo' },
  { id: 'resize', label: <>تغيير الحجم إلى <Ltr>224×224</Ltr> بلا قصّ</>, state: 'todo' },
  { id: 'efficientnet_b0', label: 'تشغيل النموذج B', state: 'todo' },
  { id: 'custom_cnn', label: 'تشغيل النموذج A', state: 'todo' },
  { id: 'decide', label: <><Ltr>softmax</Ltr> ثم المقارنة بالعتبة</>, state: 'todo' },
];

export function Classifier({ models, labels, names, samples, maxUploadMb }: Props) {
  const byKey = Object.fromEntries(models.map((m) => [m.key, m])) as Record<ModelKey, ClientModel>;
  const [loads, setLoads] = useState<Record<ModelKey, LoadState>>({
    efficientnet_b0: { status: 'waiting', phase: 'connecting', fraction: 0 },
    custom_cnn: { status: 'waiting', phase: 'connecting', fraction: 0 },
  });
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [activeSample, setActiveSample] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);
  const loadChain = useRef<Promise<void> | null>(null);

  // Model B first, then A, one at a time: kinder to a phone's memory and bandwidth, and the
  // primary answer is ready first. The first failure stops the chain; "retry" resumes it.
  const startLoading = useCallback(() => {
    if (loadChain.current) return;
    const set = (key: ModelKey, state: LoadState) => setLoads((old) => ({ ...old, [key]: state }));
    loadChain.current = (async () => {
      for (const model of models) {
        set(model.key, { status: 'loading', phase: 'connecting', fraction: 0 });
        try {
          await loadModel(model, (progress) => {
            set(model.key, { status: 'loading', phase: progress.phase, fraction: progress.fraction });
          });
          set(model.key, { status: 'ready', phase: 'preparing', fraction: 1 });
        } catch (cause) {
          const { message, detail } = explain(cause);
          set(model.key, { status: 'error', phase: 'connecting', fraction: 0, message, detail });
          break;
        }
      }
    })().finally(() => {
      loadChain.current = null;
    });
  }, [models]);

  useEffect(() => {
    startLoading();
  }, [startLoading]);

  useEffect(() => () => {
    if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const classify = useCallback(
    async (blob: Blob, truth: string | null) => {
      const id = ++runId.current;
      const current = initialSteps();
      const update = (stepId: string, patch: Partial<Step>) => {
        const step = current.find((s) => s.id === stepId)!;
        Object.assign(step, patch);
        if (id === runId.current) setSteps(current.map((s) => ({ ...s })));
      };

      setBusy(true);
      setError(null);
      setResult(null);
      update('decode', { state: 'doing' });
      await paint();

      try {
        const input = await preprocess(blob);
        if (id !== runId.current) return;
        const { source, shrunk } = input;
        update('decode', { state: 'done', ms: input.ms.decode, detail: `${source.width}×${source.height} · ${input.decoder} decoder` });
        update('shrink', {
          state: 'done',
          ms: input.ms.shrink,
          detail: shrunk ? `→ ${shrunk.width}×${shrunk.height}` : 'لا حاجة: الصورة صغيرة أصلًا',
        });
        update('resize', { state: 'done', ms: input.ms.resize, detail: `${INPUT_SIZE * INPUT_SIZE * 3} رقمًا` });
        previewRef.current?.getContext('2d')?.putImageData(input.preview, 0, 0);

        const verdicts = {} as Record<ModelKey, Verdict>;
        let softmaxNote = '';
        for (const model of models) {
          update(model.key, { state: 'doing' });
          await paint();
          const output = await runModel(model, input.data);
          if (id !== runId.current) return;
          const top = topK(output.probs, 3);
          verdicts[model.key] = {
            top,
            unknown: top[0].prob < model.threshold,
            label: labels[top[0].index],
            ms: output.ms,
          };
          update(model.key, { state: 'done', ms: output.ms });
          softmaxNote = output.softmaxApplied
            ? 'حُسبت softmax في المتصفح'
            : `المجموع = ${output.rawSum.toFixed(3)}`;
        }
        update('decide', { state: 'done', detail: softmaxNote });
        setResult({ verdicts, truth });
      } catch (cause) {
        if (id !== runId.current) return;
        setSteps(null);
        if (cause instanceof UnsupportedImageError) {
          setError(
            cause.reason === 'heic'
              ? 'هذا المتصفح لا يستطيع قراءة صور HEIC. التقط الصورة بصيغة JPG أو حوّلها، ثم أعد المحاولة.'
              : 'تعذّرت قراءة هذا الملف. جرّب صورة بصيغة JPG أو PNG أو WebP.',
          );
        } else {
          setError(explain(cause).message);
        }
      } finally {
        if (id === runId.current) setBusy(false);
      }
    },
    [labels, models],
  );

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setActiveSample(null);
      // Some browsers report an empty type for HEIC, so the file name counts too.
      if (!file.type.startsWith('image/') && !(file.type === '' && IMAGE_NAME.test(file.name))) {
        setError('هذا الملف ليس صورة. اختر ملفًا بصيغة JPG أو PNG أو WebP.');
        return;
      }
      if (file.size > maxUploadMb * 1024 * 1024) {
        setError(
          `الصورة كبيرة جدًا (${(file.size / 1024 / 1024).toFixed(1)} MB). الحد الأقصى ${maxUploadMb} MB.`,
        );
        return;
      }
      setImageUrl(URL.createObjectURL(file));
      void classify(file, null);
    },
    [classify, maxUploadMb],
  );

  const handleSample = useCallback(
    async (sample: Sample) => {
      setActiveSample(sample.cls);
      setImageUrl(sample.url);
      resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      try {
        const response = await fetch(sample.url);
        if (!response.ok) throw new Error();
        await classify(await response.blob(), sample.cls);
      } catch {
        setError('تعذّر تحميل صورة المثال. تحقّق من اتصالك ثم أعد المحاولة.');
      }
    },
    [classify],
  );

  const primary = result?.verdicts.efficientnet_b0;
  const secondary = result?.verdicts.custom_cnn;
  const failed = models.map((m) => loads[m.key]).find((load) => load.status === 'error');
  const argmaxCorrect = (key: ModelKey) => samples.filter((s) => s.ref[key].correct).length;

  let agreement: string | null = null;
  if (primary && secondary) {
    if (primary.unknown && secondary.unknown) agreement = 'النموذجان كلاهما غير متأكدين من هذه الصورة.';
    else if (primary.unknown) agreement = 'النموذج B غير متأكد، والنموذج A أعطى جوابًا. لا تعتمد على جواب A وحده.';
    else if (secondary.unknown) agreement = 'النموذج A غير متأكد. الجواب المعتمد هو جواب النموذج B.';
    else if (primary.label === secondary.label) agreement = 'النموذجان متفقان على الجواب.';
    else
      agreement = `النموذجان مختلفان: B يقول «${names[primary.label]}» و A يقول «${names[secondary.label]}». الأرجح هو جواب B لأنه الأدق.`;
  }

  return (
    <div className={styles.root}>
      <section className={styles.loads} aria-label="حالة تحميل النموذجين">
        {models.map((model) => {
          const load = loads[model.key];
          const info = MODEL_INFO[model.key];
          const downloading = load.status === 'loading' && load.phase === 'downloading';
          return (
            <div key={model.key} className={styles.load} data-status={load.status} data-phase={load.phase}>
              <span className="label">
                النموذج {info.letter} · <Ltr>{info.latin}</Ltr> · <Ltr>{model.sizeMb} MB</Ltr>
              </span>
              <span className={styles.loadState} role="status">
                {load.status === 'ready' ? (
                  'جاهز'
                ) : load.status === 'error' ? (
                  'فشل التحميل'
                ) : load.status === 'waiting' ? (
                  'في الانتظار'
                ) : load.phase === 'connecting' ? (
                  'جارٍ الاتصال…'
                ) : load.phase === 'preparing' ? (
                  'يُجهَّز للتشغيل…'
                ) : (
                  <>
                    يُحمَّل <span className="num">{Math.round(load.fraction * 100)}%</span>
                  </>
                )}
              </span>
              <span className={styles.loadBar} aria-hidden="true">
                <span
                  className={downloading || load.status !== 'loading' ? undefined : styles.loadPulse}
                  style={downloading ? { inlineSize: `${load.fraction * 100}%` } : undefined}
                />
              </span>
            </div>
          );
        })}
        {failed ? (
          <div className={styles.loadError} role="alert">
            <p>{failed.message}</p>
            {failed.detail ? <p className={`${styles.loadDetail} ltr`}>{failed.detail}</p> : null}
            <button type="button" className="btn" onClick={startLoading}>
              أعد المحاولة
            </button>
          </div>
        ) : null}
      </section>

      <div className={styles.bench}>
        <section className={styles.input} aria-label="اختيار الصورة">
          <div
            className={styles.drop}
            data-dragging={dragging}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFile(event.dataTransfer.files[0]);
            }}
          >
            {imageUrl ? (
              <div className={styles.views}>
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="الصورة التي اخترتها" />
                  <figcaption className="label">صورتك</figcaption>
                </figure>
                <figure>
                  <canvas
                    ref={previewRef}
                    width={INPUT_SIZE}
                    height={INPUT_SIZE}
                    role="img"
                    aria-label="الصورة كما تدخل إلى النموذج: مربّعة بحجم 224 في 224"
                  />
                  <figcaption className="label">
                    ما يراه النموذج · <Ltr>224×224</Ltr>
                  </figcaption>
                </figure>
              </div>
            ) : (
              <p className={styles.dropHint}>
                اسحب صورة حيوان وأفلتها هنا
                <span className="small">أو استخدم أحد الزرّين</span>
              </p>
            )}
            <div className={styles.pickers}>
              <label className={`btn ${styles.picker}`}>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    handleFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                اختر صورة
              </label>
              <label className={`btn btn--ghost ${styles.picker}`}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    handleFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                التقط بالكاميرا
              </label>
            </div>
          </div>
          <p className={styles.privacy}>تُعالَج الصورة على جهازك، ولا تُرفع أبدًا.</p>
          <p className="small">
            الصيغ المقبولة: <Ltr>JPG, PNG, WebP</Ltr>. الحد الأقصى <Ltr>{maxUploadMb} MB</Ltr>.
          </p>
        </section>

        <section className={styles.output} aria-label="النتيجة" ref={resultRef}>
          <div aria-live="polite" aria-atomic="true">
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            {!error && !result && !steps ? (
              <p className={styles.empty}>الجواب يظهر هنا بعد اختيار صورة.</p>
            ) : null}

            {primary ? (
              <article className={styles.primary} data-unknown={primary.unknown}>
                <p className="label">
                  الجواب الأساسي · النموذج B · <Ltr>{MODEL_INFO.efficientnet_b0.latin}</Ltr>
                </p>
                <AnswerBlock
                  verdict={primary}
                  model={byKey.efficientnet_b0}
                  labels={labels}
                  names={names}
                  truth={result?.truth ?? null}
                  size="large"
                />
              </article>
            ) : null}

            {agreement ? <p className={styles.agreement}>{agreement}</p> : null}

            {secondary ? (
              <article className={styles.secondary} data-unknown={secondary.unknown}>
                <p className="label">
                  للمقارنة · النموذج A · <Ltr>{MODEL_INFO.custom_cnn.latin}</Ltr> · مبنيّ من الصفر
                </p>
                <AnswerBlock
                  verdict={secondary}
                  model={byKey.custom_cnn}
                  labels={labels}
                  names={names}
                  truth={result?.truth ?? null}
                  size="small"
                />
              </article>
            ) : null}
          </div>

          {steps ? (
            <div className={styles.pipeline}>
              <h2 className="label">ما حدث على جهازك{busy ? ' · جارٍ العمل' : ''}</h2>
              <ol>
                {steps.map((step, i) => (
                  <li key={step.id} data-state={step.state}>
                    <span className="num">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      {step.label}
                      {step.detail ? <span className={styles.stepDetail}> · <Ltr>{step.detail}</Ltr></span> : null}
                    </span>
                    <span className="num ltr">
                      {step.state === 'doing' ? '…' : step.ms !== undefined ? ms(step.ms) : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      </div>

      <section className={styles.gallery} aria-labelledby="gallery-title">
        <div className={styles.galleryHead}>
          <h2 id="gallery-title" className="display h2">
            جرّب مثالًا
          </h2>
          <p className="small">
            صورة اختبار واحدة لكل صنف، لم يرها النموذجان أثناء التدريب. العلامات تبيّن جواب كل نموذج عليها،
            والأخطاء معروضة كما هي: بالجواب الأول أصاب النموذج B في{' '}
            <span className="num">{argmaxCorrect('efficientnet_b0')}</span> من{' '}
            <span className="num">{samples.length}</span>، والنموذج A في{' '}
            <span className="num">{argmaxCorrect('custom_cnn')}</span>.
          </p>
          <ul className={`legend ${styles.key}`}>
            <li className="legend__item">
              <span className={styles.mark} data-kind="right">✓</span> صحيح
            </li>
            <li className="legend__item">
              <span className={styles.mark} data-kind="wrong">✗</span> خطأ
            </li>
            <li className="legend__item">
              <span className={styles.mark} data-kind="unsure">؟</span> ثقة تحت العتبة: «غير معروف»
            </li>
          </ul>
        </div>
        <ul className={styles.samples}>
          {samples.map((sample) => (
            <li key={sample.cls}>
              <button
                type="button"
                onClick={() => void handleSample(sample)}
                aria-pressed={activeSample === sample.cls}
                aria-label={`جرّب صورة ${names[sample.cls]}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sample.url} alt="" loading="lazy" width={160} height={160} />
                <span className={styles.sampleName}>{names[sample.cls]}</span>
                <span className={styles.sampleMarks}>
                  {(['efficientnet_b0', 'custom_cnn'] as const).map((key) => {
                    const ref = sample.ref[key];
                    const kind = ref.belowThreshold ? 'unsure' : ref.correct ? 'right' : 'wrong';
                    const word = { right: 'صحيح', wrong: 'خطأ', unsure: 'غير معروف' }[kind];
                    return (
                      <span key={key} className={styles.mark} data-kind={kind}>
                        <span aria-hidden="true">
                          {MODEL_INFO[key].letter} {{ right: '✓', wrong: '✗', unsure: '؟' }[kind]}
                        </span>
                        <span className="sr-only">
                          النموذج {MODEL_INFO[key].letter}: {word}.
                        </span>
                      </span>
                    );
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

interface AnswerProps {
  verdict: Verdict;
  model: ClientModel;
  labels: string[];
  names: Record<string, string>;
  truth: string | null;
  size: 'large' | 'small';
}

function AnswerBlock({ verdict, model, labels, names, truth, size }: AnswerProps) {
  const best = verdict.top[0];
  const correct = truth !== null && !verdict.unknown && verdict.label === truth;
  return (
    <div className={styles.answer} data-size={size}>
      {verdict.unknown ? (
        <>
          <p className={styles.verdict}>غير معروف</p>
          <p className={styles.unknownNote}>
            ليس واحدًا من الـ<span className="num">{labels.length}</span> حيوانًا، أو أن النموذج غير متأكد:
            أعلى ثقة <span className="num">{pct(best.prob)}</span> وهي أقل من العتبة{' '}
            <span className="num">{pct(model.threshold)}</span>.
          </p>
        </>
      ) : (
        <p className={styles.verdict}>
          {names[verdict.label]}
          <span className={`ltr ${styles.verdictEn}`}>{verdict.label}</span>
        </p>
      )}

      <div className={styles.confidence}>
        <div className={styles.confidenceHead}>
          <span>الثقة</span>
          <span className="num">{pct(best.prob)}</span>
        </div>
        <div
          className={styles.track}
          role="meter"
          aria-label="ثقة النموذج"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(best.prob * 100)}
        >
          <span className={styles.fill} style={{ inlineSize: pct(best.prob) }} />
          <span className={styles.tick} style={{ insetInlineStart: pct(model.threshold) }} />
        </div>
        <p className={`label ${styles.tickLabel}`}>
          عتبة «غير معروف»: <span className="num">{pct(model.threshold)}</span>
        </p>
      </div>

      <ol className={styles.top}>
        {verdict.top.map((item, i) => (
          <li key={item.index}>
            <span className="num">{i + 1}</span>
            <span>
              {names[labels[item.index]]} <span className="label ltr">{labels[item.index]}</span>
            </span>
            <span className="num">{pct(item.prob)}</span>
            <span className={styles.topBar} aria-hidden="true">
              <span style={{ inlineSize: pct(item.prob) }} />
            </span>
          </li>
        ))}
      </ol>
      {verdict.unknown ? <p className="label">القائمة أعلاه أقرب التخمينات فقط، وليست جوابًا.</p> : null}

      <p className={styles.meta}>
        {truth !== null ? (
          <span data-correct={correct}>
            الصنف الحقيقي: {names[truth]}.{' '}
            {correct ? 'الجواب صحيح.' : verdict.unknown ? 'النموذج لم يتعرّف عليه.' : 'الجواب خطأ.'}
          </span>
        ) : (
          <span />
        )}
        <span className="num ltr">{ms(verdict.ms)}</span>
      </p>
    </div>
  );
}
