'use client';

import { useState } from 'react';
import styles from './Neuron.module.css';

const INPUT_Y = [44, 115, 186];
const SUBSCRIPT = ['₁', '₂', '₃'];
const Z_RANGE = 8; // |z| can reach 3 × 1 × 2 + 2

const fmt = (n: number) => n.toFixed(2);

interface SliderProps {
  id: string;
  symbol: string;
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function Slider({ id, symbol, name, value, min, max, onChange }: SliderProps) {
  return (
    <div className={styles.slider}>
      <label htmlFor={id}>
        <span className="num ltr">{symbol}</span>
        <span className="sr-only"> {name}</span>
      </label>
      <input
        id={id}
        type="range"
        dir="ltr"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id} className="num ltr">
        {fmt(value)}
      </output>
    </div>
  );
}

/** One artificial neuron: weighted sum of three inputs plus a bias, then ReLU. */
export function Neuron() {
  const [inputs, setInputs] = useState([0.8, 0.4, 0.6]);
  const [weights, setWeights] = useState([1.2, -0.9, 0.5]);
  const [bias, setBias] = useState(0.1);

  const z = inputs.reduce((sum, x, i) => sum + x * weights[i], bias);
  const a = Math.max(0, z);
  const setAt = (list: number[], set: (next: number[]) => void, i: number) => (value: number) =>
    set(list.map((old, k) => (k === i ? value : old)));

  const plotX = (value: number) => 60 + (value / Z_RANGE) * 52;
  const plotY = (value: number) => 62 - (value / Z_RANGE) * 52;

  return (
    <div className={styles.neuron}>
      <figure className={styles.stage}>
        <svg
          className="chart"
          viewBox="0 0 360 230"
          role="img"
          aria-label="رسم عصبون واحد: ثلاثة مداخل على اليمين، ثم المجموع الموزون، ثم دالة ReLU، ثم المخرج على اليسار"
        >
          {inputs.map((x, i) => (
            <g key={i}>
              <line
                x1={288}
                y1={INPUT_Y[i]}
                x2={196}
                y2={115}
                style={{ stroke: 'var(--moss)' }}
                strokeWidth={0.75 + Math.abs(weights[i]) * 3}
                strokeDasharray={weights[i] < 0 ? '5 4' : undefined}
                strokeLinecap="butt"
              />
              <text x={244} y={(INPUT_Y[i] + 115) / 2 - 8} textAnchor="middle">
                {`w${SUBSCRIPT[i]} ${fmt(weights[i])}`}
              </text>
              <circle cx={312} cy={INPUT_Y[i]} r={24} style={{ fill: 'var(--mist)', stroke: 'var(--ink)' }} />
              <text x={312} y={INPUT_Y[i] - 3} textAnchor="middle">
                {`x${SUBSCRIPT[i]}`}
              </text>
              <text x={312} y={INPUT_Y[i] + 10} textAnchor="middle" className={styles.value}>
                {fmt(x)}
              </text>
            </g>
          ))}

          <line x1={126} y1={115} x2={66} y2={115} style={{ stroke: 'var(--ink)' }} strokeWidth="1.5" />
          <circle cx={160} cy={115} r={36} style={{ fill: 'var(--forest)' }} />
          <text x={160} y={108} textAnchor="middle" style={{ fill: 'var(--leaf)' }}>
            z
          </text>
          <text x={160} y={124} textAnchor="middle" className={styles.value} style={{ fill: 'var(--paper)' }}>
            {fmt(z)}
          </text>
          <text x={160} y={170} textAnchor="middle">
            {`b ${fmt(bias)}`}
          </text>

          <rect x={76} y={103} width={40} height={24} style={{ fill: 'var(--paper)', stroke: 'var(--ink)' }} />
          <text x={96} y={119} textAnchor="middle" style={{ fill: 'var(--ink)' }}>
            ReLU
          </text>

          <circle cx={40} cy={115} r={26} style={{ fill: a > 0 ? 'var(--leaf)' : 'var(--paper)', stroke: 'var(--ink)' }} />
          <text x={40} y={111} textAnchor="middle" style={{ fill: 'var(--forest)' }}>
            a
          </text>
          <text x={40} y={125} textAnchor="middle" className={styles.value}>
            {fmt(a)}
          </text>

          <text className="chart__ar" x={312} y={226} textAnchor="middle">
            المداخل
          </text>
          <text className="chart__ar" x={160} y={226} textAnchor="middle">
            المجموع الموزون
          </text>
          <text className="chart__ar" x={40} y={226} textAnchor="middle">
            المخرج
          </text>
        </svg>
      </figure>

      <div className={styles.controls}>
        <fieldset>
          <legend className="label">المداخل (من 0 إلى 1)</legend>
          {inputs.map((x, i) => (
            <Slider
              key={i}
              id={`neuron-x${i}`}
              symbol={`x${SUBSCRIPT[i]}`}
              name={`الدخل ${i + 1}`}
              value={x}
              min={0}
              max={1}
              onChange={setAt(inputs, setInputs, i)}
            />
          ))}
        </fieldset>
        <fieldset>
          <legend className="label">الأوزان والانحياز (من −2 إلى 2)</legend>
          {weights.map((w, i) => (
            <Slider
              key={i}
              id={`neuron-w${i}`}
              symbol={`w${SUBSCRIPT[i]}`}
              name={`الوزن ${i + 1}`}
              value={w}
              min={-2}
              max={2}
              onChange={setAt(weights, setWeights, i)}
            />
          ))}
          <Slider id="neuron-b" symbol="b" name="الانحياز" value={bias} min={-2} max={2} onChange={setBias} />
        </fieldset>
      </div>

      <div className={styles.readout} aria-live="polite">
        <div className={styles.math}>
          <p className="label">المجموع الموزون</p>
          <p className="num ltr">
            z = {inputs.map((x, i) => `${fmt(x)}×${weights[i] < 0 ? `(${fmt(weights[i])})` : fmt(weights[i])}`).join(' + ')}{' '}
            + {bias < 0 ? `(${fmt(bias)})` : fmt(bias)} = <strong>{fmt(z)}</strong>
          </p>
          <p className="label">بعد دالة ReLU</p>
          <p className="num ltr">
            a = max(0, z) = <strong>{fmt(a)}</strong>
          </p>
          <p className="small">
            {z > 0 ? 'المجموع موجب، فيمرّ كما هو.' : 'المجموع ليس موجبًا، فيصير المخرج صفرًا: العصبون «صامت».'}
          </p>
        </div>
        <svg className={`chart ${styles.relu}`} viewBox="0 0 120 80" role="img" aria-label="منحنى دالة ReLU مع موضع القيمة الحالية">
          <line x1={8} x2={112} y1={62} y2={62} style={{ stroke: 'var(--rule-strong)' }} />
          <line x1={60} x2={60} y1={6} y2={74} style={{ stroke: 'var(--rule-strong)' }} />
          <polyline
            points={`${plotX(-Z_RANGE)},62 60,62 ${plotX(Z_RANGE)},${plotY(Z_RANGE)}`}
            fill="none"
            style={{ stroke: 'var(--moss)' }}
            strokeWidth="2"
          />
          <circle cx={plotX(z)} cy={plotY(a)} r="4.5" style={{ fill: 'var(--ink)' }} />
          <text x={112} y={74} textAnchor="end">
            z
          </text>
          <text x={64} y={12}>
            a
          </text>
        </svg>
      </div>
    </div>
  );
}
