import type { Metadata } from 'next';
import Link from 'next/link';
import { ClassBars, F1Chart, LineChart } from '@/components/charts';
import { Neuron } from '@/components/Neuron';
import { L, Section } from '@/components/Section';
import { Terrain } from '@/components/Terrain';
import { type ArchBlock, customCnnArchitecture, efficientNetArchitecture } from '@/lib/arch';
import { arabicName } from '@/lib/classes';
import {
  type Augmentation,
  type Confusion,
  getConfusions,
  getHistory,
  getLabels,
  getModelCard,
  getPerClassF1,
} from '@/lib/data';
import { mixHex } from '@/lib/color';
import { int, num, pct, plain } from '@/lib/format';
import { MODEL_INFO, type ModelKey } from '@/lib/types';
import styles from './model.module.css';

export const metadata: Metadata = {
  title: 'كيف يعمل',
  description: 'من عصبون واحد إلى شبكتين كاملتين: البنية، التدريب، البيانات، النتائج والحدود.',
};

const A = MODEL_INFO.custom_cnn;
const B = MODEL_INFO.efficientnet_b0;

function NetworkDiagram() {
  const layers = [
    { x: 330, nodes: 4, fill: 'var(--mist)' },
    { x: 255, nodes: 6, fill: 'var(--leaf)' },
    { x: 180, nodes: 6, fill: 'var(--fern)' },
    { x: 105, nodes: 5, fill: 'var(--moss)' },
    { x: 30, nodes: 3, fill: 'var(--ink)' },
  ];
  const y = (count: number, i: number) => 110 + (i - (count - 1) / 2) * 32;
  return (
    <svg
      className="chart"
      viewBox="0 0 360 250"
      role="img"
      aria-label="رسم مبسّط لشبكة عصبية: طبقة مدخل على اليمين، ثلاث طبقات مخفية، ثم طبقة مخرج على اليسار. كل عصبون متصل بكل عصبونات الطبقة التالية."
    >
      {layers.slice(0, -1).map((layer, l) =>
        Array.from({ length: layer.nodes }, (_, i) =>
          Array.from({ length: layers[l + 1].nodes }, (_, j) => (
            <line
              key={`${l}-${i}-${j}`}
              x1={layer.x}
              y1={y(layer.nodes, i)}
              x2={layers[l + 1].x}
              y2={y(layers[l + 1].nodes, j)}
              style={{ stroke: 'var(--rule)' }}
              strokeWidth="1"
            />
          )),
        ),
      )}
      {layers.map((layer) =>
        Array.from({ length: layer.nodes }, (_, i) => (
          <circle
            key={`${layer.x}-${i}`}
            cx={layer.x}
            cy={y(layer.nodes, i)}
            r="9"
            style={{ fill: layer.fill, stroke: 'var(--ink)' }}
            strokeWidth="1"
          />
        )),
      )}
      <path d="M270 216V222H90V216" fill="none" style={{ stroke: 'var(--rule-strong)' }} />
      <text className="chart__ar" x={330} y={242} textAnchor="middle">
        المدخل
      </text>
      <text className="chart__ar" x={180} y={242} textAnchor="middle">
        طبقات مخفية
      </text>
      <text className="chart__ar" x={30} y={242} textAnchor="middle">
        المخرج
      </text>
    </svg>
  );
}

function ArchList({ blocks, showParams }: { blocks: ArchBlock[]; showParams: boolean }) {
  return (
    <ol className={styles.arch}>
      {blocks.map((block, i) => (
        <li key={i} style={{ '--strip': mixHex('#a9ca9c', '#08160e', i / (blocks.length - 1)) } as React.CSSProperties}>
          <span className={styles.archName}>{block.name}</span>
          <span className={`num ltr ${styles.archShape}`}>{block.shape}</span>
          <span className={`ltr ${styles.archDetail}`}>{block.detail}</span>
          <span className={`num ltr ${styles.archParams}`}>
            {showParams && block.params !== null && block.params > 0 ? int(block.params) : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

function augmentationText(aug: Augmentation) {
  return `±${aug.rotation_deg}° · zoom +${pct(aug.zoom_in, 0)} / −${pct(aug.zoom_out, 0)} · shift ${pct(aug.translate, 0)} · contrast ${pct(aug.contrast, 0)} · brightness ${pct(aug.brightness, 0)}`;
}

function ConfusionList({ items }: { items: Confusion[] }) {
  return (
    <ol className={styles.confusions}>
      {items.map((c) => (
        <li key={`${c.truth}-${c.pred}`}>
          <span>
            <strong>{arabicName(c.truth)}</strong> ظنّه <strong>{arabicName(c.pred)}</strong>
          </span>
          <span className="num ltr">
            {c.count} / {c.outOf}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ModelPage() {
  const card = getModelCard();
  const labels = getLabels();
  const a = card.models.custom_cnn;
  const b = card.models.efficientnet_b0;
  const [height, width, channels] = card.input.shape;
  const split = card.data.images_per_split;
  const totalImages = split.train + split.val + split.test;
  const share = (n: number) => Math.round((n / totalImages) * 100);

  const archA = customCnnArchitecture(card);
  const archB = efficientNetArchitecture(card);

  const classRows = Object.entries(card.data.images_per_class)
    .map(([cls, counts]) => ({ name: arabicName(cls), ...counts }))
    .sort((p, q) => q.train + q.val + q.test - (p.train + p.val + p.test));
  const perClassTest = Object.values(card.data.images_per_class).map((c) => c.test);
  const smallClasses = perClassTest.filter((n) => n <= 8);

  const f1 = getPerClassF1()
    .map((r) => ({ name: arabicName(r.cls), a: r.custom_cnn, b: r.efficientnet_b0, n: r.testImages }))
    .sort((p, q) => q.b - p.b || q.a - p.a);

  const history: Record<ModelKey, ReturnType<typeof getHistory>> = {
    custom_cnn: getHistory('custom_cnn'),
    efficientnet_b0: getHistory('efficientnet_b0'),
  };
  // The second stage of model B starts where the learning rate drops.
  const stageAt = history.efficientnet_b0.findIndex(
    (row, i, rows) => i > 0 && row.learning_rate < rows[i - 1].learning_rate * 0.5,
  );
  const lossMax = Math.ceil(
    Math.max(...Object.values(history).flatMap((rows) => rows.flatMap((r) => [r.loss, r.val_loss]))),
  );

  const metrics: { label: React.ReactNode; key: keyof typeof a.test_results }[] = [
    { label: 'الدقّة (الجواب الأول صحيح)', key: 'accuracy' },
    { label: 'الصحيح ضمن أول 3 تخمينات', key: 'top3_accuracy' },
    { label: <>متوسط <L>F1</L> على الأصناف</>, key: 'macro_f1' },
    { label: <>الدقّة على صور المصدر <L>d1</L></>, key: 'accuracy_d1' },
    { label: <>الدقّة على صور المصدر <L>d3</L></>, key: 'accuracy_d3' },
  ];

  const settings: { group?: string; label: React.ReactNode; a: React.ReactNode; b: React.ReactNode }[] = [
    { group: 'مشترك', label: 'خوارزمية التحديث', a: card.training.optimizer, b: card.training.optimizer },
    { label: 'حجم الدفعة', a: card.training.batch_size, b: card.training.batch_size },
    { label: <L>label smoothing</L>, a: card.training.label_smoothing, b: card.training.label_smoothing },
    { label: 'أوزان الأصناف', a: card.training.class_weights, b: card.training.class_weights },
    { label: 'البذرة العشوائية', a: card.training.seed, b: card.training.seed },
    { group: 'المرحلة 1', label: 'ما يُدرَّب', a: 'الشبكة كلها', b: 'طبقة المخرج فقط، والباقي مجمَّد' },
    { label: 'معدّل التعلّم', a: plain(a.settings.lr), b: plain(b.settings.head_lr) },
    { label: 'أقصى عدد للدورات', a: a.settings.epochs, b: b.settings.head_epochs },
    { label: 'صبر التوقف المبكر', a: a.settings.patience, b: b.settings.head_patience },
    {
      group: 'المرحلة 2 · الضبط الدقيق',
      label: 'ما يُدرَّب',
      a: 'لا توجد',
      b: `آخر ${b.settings.unfreeze_last} طبقة + طبقة المخرج`,
    },
    { label: 'معدّل التعلّم', a: '', b: plain(b.settings.ft_lr) },
    { label: 'أقصى عدد للدورات', a: '', b: b.settings.ft_epochs },
    { label: 'صبر التوقف المبكر', a: '', b: b.settings.ft_patience },
    { group: 'مقاومة الحفظ', label: <L>Dropout</L>, a: a.settings.dropout, b: b.settings.dropout },
    { label: <L>L2</L>, a: plain(a.settings.l2), b: '' },
    { label: 'تنويع الصور', a: augmentationText(a.settings.aug), b: augmentationText(b.settings.aug) },
    { group: 'ما حدث فعلًا', label: 'الدورات المنفَّذة', a: a.epochs_run, b: b.epochs_run },
    { label: 'زمن التدريب (دقيقة)', a: a.train_minutes, b: b.train_minutes },
    { label: 'عدد المعاملات', a: int(a.parameters), b: int(b.parameters) },
  ];

  const evidence = [
    { src: 'class_distribution.png', caption: 'توزيع الصور على الأصناف والمصادر' },
    { src: 'augmentation_preview.png', caption: 'أمثلة على تنويع الصور أثناء التدريب' },
    { src: 'curves_custom_cnn.png', caption: 'منحنيات تدريب النموذج A' },
    { src: 'curves_efficientnet_b0.png', caption: 'منحنيات تدريب النموذج B' },
    { src: 'model_comparison.png', caption: 'مقارنة النموذجين' },
    { src: 'confusion_custom_cnn.png', caption: 'مصفوفة الالتباس للنموذج A' },
    { src: 'confusion_efficientnetb0.png', caption: 'مصفوفة الالتباس للنموذج B' },
    { src: 'unknown_threshold.png', caption: 'اختيار عتبة «غير معروف»' },
    { src: 'errors_custom_cnn.png', caption: 'أمثلة من أخطاء النموذج A' },
    { src: 'errors_efficientnetb0.png', caption: 'أمثلة من أخطاء النموذج B' },
  ];

  const confusionsB = getConfusions('efficientnet_b0', 3);

  const models = [
    { key: 'custom_cnn' as const, info: A, entry: a },
    { key: 'efficientnet_b0' as const, info: B, entry: b },
  ];

  return (
    <>
      <header className="page-head">
        <Terrain className="page-head__art" seed={33} width={760} height={460} count={9} mode="lines" />
        <div className="wrap">
          <p className="label">كيف يعمل</p>
          <h1 className="display h1">من عصبون واحد إلى شبكة كاملة</h1>
          <p className="lede">
            نبدأ بأصغر قطعة في الشبكة، ثم نرى كيف تتراكم الطبقات، وكيف دُرّب النموذجان، وأين ينجحان وأين
            يخطئان.
          </p>
        </div>
      </header>

      <Section num="01" name="العصبون" title="أصغر قطعة: عصبون واحد">
        <div className="prose reveal">
          <p>
            العصبون عملية حسابية بسيطة. يضرب كل مدخل في <strong>وزن</strong>، يجمع النواتج، يضيف رقمًا
            ثابتًا اسمه <strong>الانحياز</strong>، ثم يمرّر المجموع على دالة <L>ReLU</L> التي تحوّل أي رقم
            سالب إلى صفر.
          </p>
          <p>حرّك المنزلقات وراقب كيف يتغيّر المخرج. التدريب ليس إلا بحثًا آليًا عن أوزان جيدة.</p>
        </div>
        <Neuron />
      </Section>

      <Section num="02" name="الشبكة" title="عصبونات كثيرة في طبقات">
        <div className={styles.split}>
          <figure className="reveal">
            <NetworkDiagram />
            <figcaption className="note">
              الرسم مبسّط جدًا. الشبكتان الحقيقيتان فيهما ملايين الوصلات، وطبقاتهما التفافية تمسح الصورة
              بنوافذ صغيرة، لا وصلات كاملة كما في الرسم.
            </figcaption>
          </figure>
          <ol className={styles.mapping}>
            <li className="reveal">
              <span className="label">المدخل</span>
              <p className={`num ltr ${styles.mappingFigure}`}>
                {width}×{height}×{channels} = {int(width * height * channels)}
              </p>
              <p className="small">
                الصورة عند الشبكة أرقام فقط: شدّة الأحمر والأخضر والأزرق في كل نقطة، من 0 إلى 255.
              </p>
            </li>
            <li className="reveal">
              <span className="label">الطبقات المخفية</span>
              <p className={styles.mappingFigure}>حواف ← أنسجة ← أجزاء</p>
              <p className="small">
                طبقات التفافية (<L>convolution</L>). الأولى تلتقط الحواف والألوان، التي بعدها تلتقط الأنسجة
                كالفرو والريش، والأعمق تلتقط أجزاء الحيوان كالأذن والمنقار.
              </p>
            </li>
            <li className="reveal">
              <span className="label">المخرج</span>
              <p className={`num ltr ${styles.mappingFigure}`}>{labels.length}</p>
              <p className="small">
                عصبون لكل حيوان. دالة <L>softmax</L> تحوّل أرقامها إلى نسب مجموعها <span className="num">100%</span>، وأعلاها هو الجواب.
              </p>
            </li>
          </ol>
        </div>
      </Section>

      <Section num="03" name="البنية" title="البنيتان جنبًا إلى جنب">
        <p className="prose reveal">
          كل سطر طبقة أو مجموعة طبقات. العمود الأوسط هو شكل البيانات الخارجة منها (ارتفاع × عرض × قنوات):
          الصورة تصغر مساحةً وتزداد قنواتٍ كلما نزلنا.
        </p>
        <div className={styles.archPair}>
          <article className="reveal">
            <header className={styles.archHead}>
              <span className="label">النموذج A · {A.title}</span>
              <h3 className="h3 ltr">{A.latin}</h3>
              <p className="num ltr">{int(a.parameters)} params</p>
            </header>
            <ArchList blocks={archA.blocks} showParams={archA.paramsVerified} />
            <p className="small">
              {archA.paramsVerified
                ? 'أعداد المعاملات محسوبة من إعدادات النموذج، ومجموعها يطابق العدد الكلّي تمامًا.'
                : 'تعذّر التحقّق من أعداد المعاملات لكل كتلة، فعُرض العدد الكلّي فقط.'}
            </p>
          </article>
          <article className="reveal">
            <header className={styles.archHead}>
              <span className="label">النموذج B · {B.title}</span>
              <h3 className="h3 ltr">{B.latin}</h3>
              <p className="num ltr">{int(b.parameters)} params</p>
            </header>
            <ArchList blocks={archB.blocks} showParams />
            <p className="small">
              الجسم المدرَّب مسبقًا على <L>ImageNet</L> فيه <span className="num">{int(archB.backboneParams)}</span>{' '}
              معاملًا. أضفتُ فوقه طبقة مخرج واحدة فيها <span className="num">{int(archB.headParams)}</span> معاملًا
              فقط.
            </p>
          </article>
        </div>
      </Section>

      <Section num="04" name="التدريب" title="إعدادات التدريب">
        <div className="prose reveal">
          <p>
            النموذج A يتدرّب مرة واحدة من أرقام عشوائية. النموذج B يتدرّب على <strong>مرحلتين</strong>: أولًا
            طبقة المخرج الجديدة وحدها والجسم مجمَّد، ثم يُفكّ تجميد آخر{' '}
            <span className="num">{b.settings.unfreeze_last}</span> طبقة وتُضبط بمعدّل تعلّم صغير جدًا حتى
            لا يضيع ما تعلّمته الشبكة سابقًا.
          </p>
        </div>
        <div className="table-scroll reveal">
          <table className={`table ${styles.settings}`}>
            <thead>
              <tr>
                <th scope="col">الإعداد</th>
                <th scope="col">
                  A<span className={styles.thName}>{A.latin}</span>
                </th>
                <th scope="col">
                  B<span className={styles.thName}>{B.latin}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {settings.map((row, i) => (
                <FragmentRow key={i} {...row} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section num="05" name="البيانات" title="من أين جاءت الصور وكيف نُظّفت">
        <dl className={styles.splitFigures}>
          {(
            [
              ['تدريب', split.train],
              ['تحقّق', split.val],
              ['اختبار', split.test],
            ] as const
          ).map(([name, count]) => (
            <div key={name} className="reveal">
              <dt className="label">
                {name} · <span className="num">{share(count)}%</span>
              </dt>
              <dd className="num">{int(count)}</dd>
            </div>
          ))}
        </dl>
        <div className="prose reveal">
          <p>
            <span className="num">{int(totalImages)}</span> صورة من مجموعتي بيانات على <L>Kaggle</L>:
          </p>
          <ul className={styles.sources}>
            {Object.entries(card.data.sources).map(([id, source]) => (
              <li key={id}>
                <span className="label">{id}</span>
                <a href={`https://www.${source}`} target="_blank" rel="noreferrer">
                  <L>{source.replace('kaggle.com/datasets/', '')}</L>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.split}>
          <figure className="reveal">
            <figcaption>
              <h3 className="h3">عدد الصور لكل صنف</h3>
              <div className="legend">
                <span className="legend__item">
                  <span className="legend__swatch" style={{ background: 'var(--moss)' }} />
                  تدريب
                </span>
                <span className="legend__item">
                  <span className="legend__swatch" style={{ background: 'var(--fern)' }} />
                  تحقّق
                </span>
                <span className="legend__item">
                  <span className="legend__swatch" style={{ background: 'var(--leaf)' }} />
                  اختبار
                </span>
              </div>
            </figcaption>
            <ClassBars rows={classRows} title="عدد صور التدريب والتحقّق والاختبار لكل صنف" />
            <p className="small">
              بعض الأصناف صورها أكثر بثلاث مرات تقريبًا من غيرها. لذلك استُخدمت أوزان للأصناف، حتى لا يميل
              النموذج إلى الأصناف الكبيرة.
            </p>
          </figure>
          <div className="reveal">
            <h3 className="h3">خطوات التنظيف</h3>
            <ol className={styles.cleaning}>
              <li>
                <strong>فتح كل صورة وتوحيدها.</strong> يُصحَّح اتجاهها وتُحوَّل إلى <L>RGB</L>. الصور التالفة
                والصغيرة جدًا تُحذف.
              </li>
              <li>
                <strong>حذف المكرّر.</strong> لكل صورة بصمة بصرية. المتطابقتان من الصنف نفسه تبقى واحدة
                منهما، والمتطابقتان من صنفين مختلفين تُحذفان معًا لأن التسمية متعارضة.
              </li>
              <li>
                <strong>مراجعة يدوية.</strong> راجعتُ كل صنف بعيني. الرسوم والألعاب والصور التي لا يظهر
                فيها الحيوان دخلت قائمة سوداء، فلا تعود عند إعادة البناء.
              </li>
              <li>
                <strong>تقسيم ثابت ومتوازن.</strong> <span className="num">{share(split.train)}/{share(split.val)}/{share(split.test)}</span>{' '}
                للتدريب والتحقّق والاختبار، بالنسبة نفسها داخل كل صنف، وببذرة عشوائية ثابتة.
              </li>
              <li>
                <strong>فحص التسريب.</strong> تأكدتُ أن لا صورة في التحقّق أو الاختبار تكاد تطابق صورة في
                التدريب.
              </li>
            </ol>
            <p className="note">
              استبعدتُ مجموعة بيانات ثالثة بالكامل، لأنها كانت نسخًا مدوَّرة ومائلة من الصور نفسها. لو
              بقيت لتسرّبت نسخ الصورة الواحدة بين التدريب والاختبار، ولظهرت الدقّة أعلى من حقيقتها.
            </p>
          </div>
        </div>
      </Section>

      <Section num="06" name="النتائج" id="results" title="النتائج على صور الاختبار" band>
        <div className="table-scroll reveal">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">المقياس</th>
                <th scope="col">
                  A<span className={styles.thName}>{A.latin}</span>
                </th>
                <th scope="col">
                  B<span className={styles.thName}>{B.latin}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  {[a, b].map((model, i) => (
                    <td key={i}>
                      <span className={`num ltr ${styles.metric}`}>{pct(model.test_results[m.key])}</span>
                      <span className={styles.meter} aria-hidden="true">
                        <span style={{ inlineSize: pct(model.test_results[m.key]) }} />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="prose reveal">
          الفرق كبير، وسببه واضح: النموذج B بدأ من شبكة رأت أكثر من مليون صورة، أما النموذج A فبدأ من الصفر
          ومعه <span className="num">{int(split.train)}</span> صورة فقط. هذا العدد قليل جدًا لشبكة تتعلّم
          كل شيء بنفسها.
        </p>

        <div className={styles.split}>
          <figure className="reveal">
            <figcaption>
              <h3 className="h3">
                <L>F1</L> لكل صنف
              </h3>
              <div className="legend">
                <span className="legend__item">
                  <span className={styles.dotA} />
                  النموذج A
                </span>
                <span className="legend__item">
                  <span className={styles.dotB} />
                  النموذج B
                </span>
              </div>
            </figcaption>
            <F1Chart rows={f1} title="قيمة F1 لكل صنف في النموذجين" />
            <p className="small">
              <L>F1</L> رقم بين 0 و1 يجمع أمرين: هل يجد النموذج صور الصنف، وهل يصيب حين يسمّيه. كل صنف هنا
              مقيس على عدد قليل من الصور.
            </p>
          </figure>

          <div>
            <div className="reveal">
              <h3 className="h3">أكثر الالتباسات تكرارًا</h3>
              <p className="small">الرقم: عدد المرات من مجموع صور الصنف في الاختبار.</p>
              <div className={styles.confusionPair}>
                {models.map(({ key, info }) => (
                  <div key={key}>
                    <p className="label">النموذج {info.letter}</p>
                    <ConfusionList items={getConfusions(key, 5)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="reveal">
          <h3 className="h3">عتبة «غير معروف»</h3>
          <p className="prose small">
            النموذج يعطي دائمًا نسبة لكل صنف، حتى لو كانت الصورة لسيارة. لذلك وضعتُ عتبة: إذا كانت أعلى نسبة
            أقل منها، يكون الجواب «غير معروف». في العتبة مقايضة: كلما ارتفعت رفض
            النموذج غرباء أكثر، ورفض معهم صورًا صحيحة أكثر.
          </p>
          <div className={styles.thresholds}>
            {models
              .slice()
              .reverse()
              .map(({ key, info, entry }) => (
                <div key={key}>
                  <p className="label">
                    النموذج {info.letter} · العتبة <span className="num">{pct(entry.unknown_threshold, 0)}</span>
                  </p>
                  <div
                    className={styles.scale}
                    role="img"
                    aria-label={`عتبة النموذج ${info.letter}: ${pct(entry.unknown_threshold, 0)}`}
                  >
                    <span style={{ inlineSize: pct(entry.unknown_threshold, 0) }}>غير معروف</span>
                    <span>يسمّي الصنف</span>
                  </div>
                  <dl className={styles.thresholdFacts}>
                    <div>
                      <dt>حيوانات خارج القائمة رُفضت</dt>
                      <dd className="num">{pct(entry.test_results.unknown_rejected)}</dd>
                    </div>
                    <div>
                      <dt>صور الاختبار التي قُبلت</dt>
                      <dd className="num">{pct(entry.test_results.test_accepted)}</dd>
                    </div>
                    <div>
                      <dt>الدقّة على ما قُبل</dt>
                      <dd className="num">{pct(entry.test_results.accuracy_when_accepted)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
          </div>
        </div>

        <div className="reveal">
          <h3 className="h3">منحنيات التدريب</h3>
          <div className="legend">
            <span className="legend__item">
              <span className={styles.lineVal} />
              صور التحقّق
            </span>
            <span className="legend__item">
              <span className={styles.lineTrain} />
              صور التدريب
            </span>
          </div>
          <div className={styles.curves}>
            {models.map(({ key, info }) => (
              <figure key={`${key}-acc`}>
                <figcaption className="label">النموذج {info.letter} · الدقّة لكل دورة</figcaption>
                <LineChart
                  title={`دقّة النموذج ${info.letter} على صور التدريب والتحقّق خلال الدورات`}
                  series={[
                    { kind: 'train', values: history[key].map((r) => r.accuracy) },
                    { kind: 'val', values: history[key].map((r) => r.val_accuracy) },
                  ]}
                  yMax={1}
                  yFormat={(value) => pct(value, 0)}
                  stageAt={key === 'efficientnet_b0' ? stageAt : undefined}
                  stageLabel="المرحلة 2"
                />
              </figure>
            ))}
            {models.map(({ key, info }) => (
              <figure key={`${key}-loss`}>
                <figcaption className="label">النموذج {info.letter} · الخطأ (loss) لكل دورة</figcaption>
                <LineChart
                  title={`خطأ النموذج ${info.letter} على صور التدريب والتحقّق خلال الدورات`}
                  series={[
                    { kind: 'train', values: history[key].map((r) => r.loss) },
                    { kind: 'val', values: history[key].map((r) => r.val_loss) },
                  ]}
                  yMax={lossMax}
                  yFormat={(value) => num(value, 1)}
                  stageAt={key === 'efficientnet_b0' ? stageAt : undefined}
                  stageLabel="المرحلة 2"
                />
              </figure>
            ))}
          </div>
          <p className="small prose">
            في النموذج A يبتعد خط التدريب عن خط التحقّق: الشبكة تحفظ صورها أكثر مما تتعلّم منها. في النموذج
            B يبقى الخطان متقاربين.
          </p>
        </div>

        <details className="details">
          <summary>الأدلة: الرسوم الأصلية من دفتر التدريب</summary>
          <div className="details__body">
            {evidence.map((item) => (
              <figure key={item.src}>
                <img src={`/reports/${item.src}`} alt={item.caption} loading="lazy" />
                <figcaption className="small">{item.caption}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      </Section>

      <Section num="07" name="الحدود" title="ما لا يجب أن تتوقعه منه">
        <ol className={styles.limits}>
          <li className="reveal">
            <h3 className="h3">مجموعة الاختبار صغيرة جدًا</h3>
            <p className="small">
              <span className="num">{smallClasses.length}</span> صنفًا من <span className="num">{labels.length}</span>{' '}
              فيها من <span className="num">{Math.min(...perClassTest)}</span> إلى{' '}
              <span className="num">{Math.max(...smallClasses)}</span> صور اختبار فقط. صورة واحدة خاطئة تُنزل
              دقّة الصنف بنحو <span className="num">{Math.round(100 / Math.max(...smallClasses))}</span> نقطة أو أكثر. الأرقام مؤشر، لا قياس دقيق.
            </p>
          </li>
          <li className="reveal">
            <h3 className="h3">الحيوانات المتشابهة تلتبس</h3>
            <p className="small">
              أكثر ما خلط فيه النموذج B على صور الاختبار:{' '}
              {confusionsB.map((c) => `${arabicName(c.truth)} و${arabicName(c.pred)}`).join('، ')}. الأشكال
              المتقاربة تربكه، خصوصًا في الصور البعيدة أو الجزئية.
            </p>
          </li>
          <li className="reveal">
            <h3 className="h3">الغرباء قد يمرّون</h3>
            <p className="small">
              العتبة ترفض <span className="num">{pct(b.test_results.unknown_rejected)}</span> من صور حيوانات
              خارج القائمة في النموذج B. الباقي، أي{' '}
              <span className="num">{pct(1 - b.test_results.unknown_rejected)}</span>، يأخذ اسم حيوان من
              القائمة بثقة تبدو عالية. لا تعتمد عليه في أي قرار مهم.
            </p>
          </li>
        </ol>
        <p className="reveal">
          <Link href="/test/" className="btn">
            جرّبه بنفسك
            <span className="btn__arrow" aria-hidden="true">
              ←
            </span>
          </Link>
        </p>
      </Section>
    </>
  );
}

function FragmentRow({
  group,
  label,
  a,
  b,
}: {
  group?: string;
  label: React.ReactNode;
  a: React.ReactNode;
  b: React.ReactNode;
}) {
  const cell = (value: React.ReactNode) =>
    typeof value === 'number' ? (
      <span className="num ltr">{value}</span>
    ) : typeof value === 'string' && /^[\x20-\x7e±−°·]+$/.test(value) ? (
      <span className="num ltr">{value}</span>
    ) : (
      value
    );
  return (
    <>
      {group ? (
        <tr className="table__group">
          <th colSpan={3} scope="colgroup">
            {group}
          </th>
        </tr>
      ) : null}
      <tr>
        <th scope="row">{label}</th>
        <td>{cell(a)}</td>
        <td>{cell(b)}</td>
      </tr>
    </>
  );
}
