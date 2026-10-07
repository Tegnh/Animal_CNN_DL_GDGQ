'use client';

import { useEffect, useRef, useState } from 'react';
import { runModel } from '@/lib/ort';
import { preprocess } from '@/lib/preprocess';
import { type ClientModel, MODEL_INFO, type ModelKey, type ReferenceEntry } from '@/lib/types';

interface Row {
  cls: string;
  results: Record<ModelKey, { top: string; refTop: string; agree: boolean; maxDiff: number }>;
}

const MAX_DIFF = 0.02;
const argmax = (values: ArrayLike<number>) => {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
};

/** Runs both models on every sample and compares with the Python probabilities. */
export function SelfTest({
  models,
  labels,
  reference,
}: {
  models: ClientModel[];
  labels: string[];
  reference: ReferenceEntry[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        for (const entry of reference) {
          const blob = await (await fetch(entry.url)).blob();
          const input = await preprocess(blob);
          const results = {} as Row['results'];
          for (const model of models) {
            const { probs } = await runModel(model, input.data);
            const expected = entry.probs[model.key];
            let maxDiff = 0;
            for (let i = 0; i < expected.length; i++) {
              maxDiff = Math.max(maxDiff, Math.abs(probs[i] - expected[i]));
            }
            const top = argmax(probs);
            const refTop = argmax(expected);
            results[model.key] = { top: labels[top], refTop: labels[refTop], agree: top === refTop, maxDiff };
          }
          setRows((old) => [...old, { cls: entry.cls, results }]);
        }
      } catch (cause) {
        setFailure(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [labels, models, reference]);

  const done = rows.length === reference.length;
  const summary = models.map((model) => {
    const agree = rows.filter((r) => r.results[model.key].agree).length;
    const maxDiff = Math.max(0, ...rows.map((r) => r.results[model.key].maxDiff));
    return { model, agree, maxDiff, pass: done && agree === rows.length && maxDiff < MAX_DIFF };
  });
  const status = failure ? 'error' : !done ? 'running' : summary.every((s) => s.pass) ? 'pass' : 'fail';

  return (
    <div data-selftest={status} dir="ltr" style={{ display: 'grid', gap: '1.5rem' }}>
      <p className="display h2" role="status">
        {status === 'running' ? `Running ${rows.length} / ${reference.length}` : status.toUpperCase()}
      </p>
      {failure ? <p className="note note--clay">{failure}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Top-1 agreement</th>
            <th scope="col">Max |Δp|</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {summary.map(({ model, agree, maxDiff, pass }) => (
            <tr key={model.key} data-model={model.key}>
              <th scope="row">
                {MODEL_INFO[model.key].letter} · {MODEL_INFO[model.key].latin}
              </th>
              <td className="num">
                {agree} / {rows.length}
              </td>
              <td className="num">{maxDiff.toFixed(5)}</td>
              <td className="num">{!done ? '…' : pass ? 'PASS' : 'FAIL'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        Pass = 100% top-1 agreement with reference_predictions.json and max |Δp| below {MAX_DIFF}. The
        samples are decoded with the TensorFlow-compatible JPEG decoder (fast integer IDCT), then resized
        with tf.image.resize bilinear, as in Python.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Sample</th>
              {models.map((m) => (
                <th key={m.key} scope="col" colSpan={2}>
                  {MODEL_INFO[m.key].letter}: browser / Python · max |Δp|
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cls}>
                <th scope="row">{row.cls}</th>
                {models.map((m) => {
                  const r = row.results[m.key];
                  return [
                    <td key={`${m.key}-top`} style={r.agree ? undefined : { color: 'var(--clay)' }}>
                      {r.top} / {r.refTop}
                    </td>,
                    <td key={`${m.key}-diff`} className="num">
                      {r.maxDiff.toFixed(5)}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
