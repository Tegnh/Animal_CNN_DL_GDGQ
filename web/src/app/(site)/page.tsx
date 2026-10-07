import Link from 'next/link';
import { Parallax } from '@/components/Parallax';
import { L, Section } from '@/components/Section';
import { Terrain } from '@/components/Terrain';
import { arabicName } from '@/lib/classes';
import { getLabels, getModelCard } from '@/lib/data';
import { int, pct } from '@/lib/format';
import { MODEL_INFO } from '@/lib/types';
import { site } from '@/site.config';
import styles from './home.module.css';

export default function HomePage() {
  const card = getModelCard();
  const labels = getLabels();
  const a = card.models.custom_cnn;
  const b = card.models.efficientnet_b0;
  const perClassTest = Object.values(card.data.images_per_class).map((c) => c.test);
  const [height, width] = card.input.shape;

  const steps = [
    {
      title: 'ارفع صورة',
      text: 'اختر صورة من جهازك، أو التقطها بكاميرا الهاتف، أو جرّب إحدى صور الأمثلة.',
    },
    {
      title: 'نموذجان يحلّلانها',
      text: 'تُصغَّر الصورة ثم تمرّ على النموذجين داخل متصفحك. لا تُرسَل إلى أي خادم.',
    },
    {
      title: 'ترى الجواب ومدى الثقة',
      text: 'يظهر اسم الحيوان ونسبة الثقة. وإذا كانت الثقة ضعيفة، يقول النموذج إنه لا يعرف.',
    },
  ];

  return (
    <>
      <section className={styles.hero}>
        <Parallax className={styles.plate}>
          <Terrain seed={7} width={900} height={900} count={13} hills={10} />
        </Parallax>
        <div className={`wrap ${styles.heroInner}`}>
          <p className="label">{site.author.name}</p>
          <h1 className={styles.name}>{site.name}</h1>
          <p className={`display ${styles.subtitle}`}>{site.subtitle}</p>
          <p className="lede">
            ضع صورة حيوان، فيخبرك النموذج باسمه وبمدى ثقته في الجواب. كل شيء يحدث داخل متصفحك.
          </p>
          <div className="btn-row">
            <Link href="/test/" className="btn">
              جرّب بصورتك
              <span className="btn__arrow" aria-hidden="true">
                ←
              </span>
            </Link>
            <Link href="/model/" className="btn btn--ghost">
              كيف يعمل؟
            </Link>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt className="label">الأصناف</dt>
              <dd className="num">{labels.length}</dd>
            </div>
            <div>
              <dt className="label">النماذج</dt>
              <dd className="num">{Object.keys(card.models).length}</dd>
            </div>
            <div>
              <dt className="label">حجم المدخل</dt>
              <dd className="num ltr">
                {width}×{height}
              </dd>
            </div>
            <div>
              <dt className="label">الخادم</dt>
              <dd>لا يوجد</dd>
            </div>
          </dl>
        </div>
      </section>

      <Section num="01" name="الفكرة" title="حاسوب يتعلّم من الأمثلة، لا من القواعد">
        <div className="prose reveal">
          <p>
            لا أحد كتب للحاسوب قاعدة تقول «الحمار الوحشي مخطّط». عرضنا عليه{' '}
            <span className="num">{int(card.data.images_per_split.train)}</span> صورة مع اسم الحيوان في كل
            واحدة، وتركناه يعدّل أرقامه الداخلية حتى صار يخطئ أقل. هذا هو التعلّم العميق باختصار.
          </p>
          <p>بنيتُ نموذجين للمهمة نفسها، حتى يظهر الفرق بينهما بوضوح:</p>
        </div>
        <ul className={styles.pair}>
          <li className="reveal">
            <span className="label">النموذج A</span>
            <h3 className="h3">مبنيّ من الصفر</h3>
            <p className="small">
              شبكة <L>CNN</L> صغيرة صمّمتها ودرّبتها بنفسي على صور المشروع فقط. دقّتها ضعيفة، وأعرضها كما
              هي.
            </p>
          </li>
          <li className="reveal">
            <span className="label">النموذج B · الجواب الأساسي</span>
            <h3 className="h3">تعلّم بالنقل</h3>
            <p className="small">
              شبكة <L>EfficientNetB0</L> تعلّمت مسبقًا من أكثر من مليون صورة، ثم أكملتُ تدريبها على
              حيواناتنا. هي التي تعطيك الجواب الرئيسي.
            </p>
          </li>
        </ul>
      </Section>

      <Section num="02" name="الطريقة" title="ثلاث خطوات">
        <ol className={styles.steps}>
          {steps.map((step, i) => (
            <li key={step.title} className="reveal">
              <span className={styles.stepNum} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="h3">{step.title}</h3>
                <p className="small">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section num="03" name="الأصناف" title={`${labels.length} حيوانًا يعرفها النموذج`}>
        <p className="prose reveal">
          أي حيوان خارج هذه القائمة غريب على النموذج. قد يقول «لا أعرف»، وقد يخطئ ويختار أقرب شبيه له.
        </p>
        <ol className={styles.index}>
          {labels.map((label, i) => (
            <li key={label}>
              <span className="label">{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.indexAr}>{arabicName(label)}</span>
              <span className="label ltr">{label}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section num="04" name="النتائج" title="الأرقام كما خرجت" band>
        <Parallax className={styles.bandArt}>
          <Terrain seed={21} width={1000} height={520} count={9} mode="lines" island={false} />
        </Parallax>
        <dl className={styles.figures}>
          <div className="reveal">
            <dt>
              دقّة النموذج B <L>({MODEL_INFO.efficientnet_b0.latin})</L>
            </dt>
            <dd className={styles.figure}>{pct(b.test_results.accuracy)}</dd>
          </div>
          <div className="reveal">
            <dt>الجواب الصحيح ضمن أول 3 تخمينات للنموذج B</dt>
            <dd className={styles.figure}>{pct(b.test_results.top3_accuracy)}</dd>
          </div>
          <div className="reveal">
            <dt>دقّة النموذج A المبنيّ من الصفر</dt>
            <dd className={styles.figure}>{pct(a.test_results.accuracy)}</dd>
          </div>
        </dl>
        <p className="note reveal">
          قيست هذه الأرقام على <span className="num">{int(card.data.images_per_split.test)}</span> صورة
          اختبار فقط، أي من <span className="num">{Math.min(...perClassTest)}</span> إلى{' '}
          <span className="num">{Math.max(...perClassTest)}</span> صورة للصنف الواحد. خطأ في صورة واحدة
          يغيّر الرقم، فاعتبرها تقريبية.
        </p>
        <p className="reveal">
          <Link href="/model/#results" className="btn btn--ghost">
            النتائج بالتفصيل
          </Link>
        </p>
      </Section>

      <section className={styles.cta}>
        <div className="wrap">
          <p className="label">الخطوة التالية</p>
          <Link href="/test/" className={styles.ctaLink}>
            <span>جرّبه الآن</span>
            <span className={styles.ctaArrow} aria-hidden="true">
              ←
            </span>
          </Link>
          <p className="small">تُعالَج الصورة على جهازك، ولا تُرفع إلى أي مكان.</p>
        </div>
      </section>
    </>
  );
}
