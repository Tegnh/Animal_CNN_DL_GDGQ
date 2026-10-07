import type { Metadata } from 'next';
import { SelfTest } from '@/components/SelfTest';
import { getClientModels, getLabels, getReference } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Self-test',
  robots: { index: false },
};

// Not linked from the navigation: checks that the browser reproduces the Python results.
export default function SelfTestPage() {
  return (
    <div className="wrap" style={{ paddingBlock: 'var(--step)' }}>
      <p className="label">/selftest</p>
      <h1 className="display h1" dir="ltr" style={{ textAlign: 'end', marginBlockEnd: '2rem' }}>
        Browser vs. Python
      </h1>
      <SelfTest models={getClientModels()} labels={getLabels()} reference={getReference()} />
    </div>
  );
}
