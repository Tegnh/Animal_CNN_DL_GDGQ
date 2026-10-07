import type { Metadata } from 'next';
import { Terrain } from '@/components/Terrain';
import { getLabels, getModelCard } from '@/lib/data';
import { site } from '@/site.config';
import styles from './og.module.css';

export const metadata: Metadata = { title: 'Plate', robots: { index: false } };

// The 1200×630 social plate. `npm run verify -- --og` captures it to public/og.png.
export default function OgPlate() {
  const card = getModelCard();
  const [height, width] = card.input.shape;
  return (
    <div className={styles.plate} id="plate">
      <Terrain className={styles.terrain} seed={7} width={760} height={760} count={13} hills={10} />
      <div className={styles.ticks} aria-hidden="true" />
      <p className={`${styles.meta} ${styles.top}`}>
        <span>PLATE 01 · SOUNDINGS IN {getLabels().length} CLASSES</span>
      </p>
      <h1 className={styles.name}>{site.name}</h1>
      <p className={styles.subtitle}>{site.subtitle}</p>
      <p className={`${styles.meta} ${styles.bottom}`}>
        <span>
          {width}×{height} · {Object.keys(card.models).length} MODELS · IN-BROWSER
        </span>
        <span>{site.nameLatin}</span>
      </p>
    </div>
  );
}
