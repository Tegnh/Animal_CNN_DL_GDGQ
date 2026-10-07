import type { Metadata } from 'next';
import { Classifier } from '@/components/Classifier';
import { Terrain } from '@/components/Terrain';
import { arabicNames } from '@/lib/classes';
import { getClientModels, getLabels, getSamples } from '@/lib/data';
import { site } from '@/site.config';

export const metadata: Metadata = {
  title: 'جرّب',
  description: 'ارفع صورة حيوان وشاهد جواب النموذجين. تُعالَج الصورة على جهازك ولا تُرفع.',
};

export default function TestPage() {
  const labels = getLabels();
  const models = getClientModels();
  const totalMb = models.reduce((sum, m) => sum + m.sizeMb, 0);

  return (
    <>
      <header className="page-head">
        <Terrain className="page-head__art" seed={58} width={760} height={420} count={8} mode="lines" />
        <div className="wrap">
          <p className="label">التجربة الحيّة</p>
          <h1 className="display h1">جرّب المصنّف</h1>
          <p className="lede">
            اختر صورة حيوان. يعمل النموذجان داخل متصفحك، فيُنزَّلان مرة واحدة (نحو{' '}
            <span className="num">{Math.round(totalMb)}</span> ميغابايت)، ثم يجيبان في أجزاء من الثانية.
          </p>
        </div>
      </header>
      <div className="wrap" style={{ paddingBlockEnd: 'var(--step)' }}>
        <Classifier
          models={models}
          labels={labels}
          names={arabicNames(labels)}
          samples={getSamples()}
          maxUploadMb={site.maxUploadMb}
        />
      </div>
    </>
  );
}
