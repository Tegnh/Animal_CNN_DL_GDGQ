// Small SVG charts in the site palette. They are drawn for a 360px-wide viewBox so
// labels stay readable on a phone, and they take their colours from the section
// they sit in (light page or deep band).

const W = 360;
const LABEL_W = 84; // Arabic class names sit on the right, bars grow away from them.
const PLOT_R = W - LABEL_W - 4;
const PLOT_L = 34;
const PLOT_W = PLOT_R - PLOT_L;
const ROW = 20;

const v = (name: string) => ({ fill: `var(--${name})` });

export interface ClassCount {
  name: string;
  train: number;
  val: number;
  test: number;
}

/** Images per class, stacked by split. */
export function ClassBars({ rows, title }: { rows: ClassCount[]; title: string }) {
  const max = Math.max(...rows.map((r) => r.train + r.val + r.test));
  const parts = [
    ['train', 'moss'],
    ['val', 'fern'],
    ['test', 'leaf'],
  ] as const;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${rows.length * ROW}`} role="img" aria-label={title}>
      {rows.map((r, i) => {
        let x = PLOT_R;
        return (
          <g key={r.name} transform={`translate(0 ${i * ROW})`}>
            <text className="chart__ar" x={W - 2} y={14} textAnchor="end">
              {r.name}
            </text>
            {parts.map(([key, colour]) => {
              const w = (r[key] / max) * PLOT_W;
              x -= w;
              return <rect key={key} x={x} y={5} width={w} height={10} style={v(colour)} />;
            })}
            <text x={x - 5} y={13.5} textAnchor="end">
              {r.train + r.val + r.test}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface F1Point {
  name: string;
  a: number;
  b: number;
  n: number;
}

/** F1 per class: hollow dot = model A, solid dot = model B. Zero is at the label side. */
export function F1Chart({ rows, title }: { rows: F1Point[]; title: string }) {
  const top = 18;
  const x = (value: number) => PLOT_R - value * PLOT_W;
  const height = top + rows.length * ROW + 4;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={x(tick)}
            x2={x(tick)}
            y1={top}
            y2={height}
            style={{ stroke: 'var(--rule)' }}
            strokeWidth="1"
          />
          <text x={x(tick)} y={10} textAnchor="middle">
            {tick.toFixed(2)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = top + i * ROW + ROW / 2;
        return (
          <g key={r.name}>
            <text className="chart__ar" x={W - 2} y={y + 4} textAnchor="end">
              {r.name}
            </text>
            <line
              x1={x(r.a)}
              x2={x(r.b)}
              y1={y}
              y2={y}
              style={{ stroke: 'var(--label)' }}
              strokeWidth="1"
            />
            <circle
              cx={x(r.a)}
              cy={y}
              r="4"
              style={{ fill: 'var(--bg)', stroke: 'var(--label)' }}
              strokeWidth="1.5"
            />
            <circle cx={x(r.b)} cy={y} r="4.5" style={v('text')} />
          </g>
        );
      })}
    </svg>
  );
}

export interface Series {
  values: number[];
  /** Validation is the solid, heavy line; training is thin and dashed. */
  kind: 'train' | 'val';
}

interface LineChartProps {
  title: string;
  series: Series[];
  yMax: number;
  yFormat: (value: number) => string;
  /** Epoch where the second training stage starts, if any. */
  stageAt?: number;
  stageLabel?: string;
}

/** Training curve over epochs. Time runs left to right. */
export function LineChart({ title, series, yMax, yFormat, stageAt, stageLabel }: LineChartProps) {
  const H = 200;
  const left = 36;
  const right = W - 8;
  const top = 14;
  const bottom = H - 24;
  const epochs = Math.max(...series.map((s) => s.values.length));
  const x = (epoch: number) => left + (epoch / (epochs - 1)) * (right - left);
  const y = (value: number) => bottom - (Math.min(value, yMax) / yMax) * (bottom - top);
  const xTicks = [...new Set([0, Math.round((epochs - 1) / 2), epochs - 1])];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line
            x1={left}
            x2={right}
            y1={y(f * yMax)}
            y2={y(f * yMax)}
            style={{ stroke: f === 0 ? 'var(--rule-strong)' : 'var(--rule)' }}
            strokeWidth="1"
          />
          <text x={left - 5} y={y(f * yMax) + 3.5} textAnchor="end">
            {yFormat(f * yMax)}
          </text>
        </g>
      ))}
      {xTicks.map((epoch) => (
        <text key={epoch} x={x(epoch)} y={H - 8} textAnchor="middle">
          {epoch + 1}
        </text>
      ))}
      {stageAt !== undefined && stageAt > 0 ? (
        <g>
          <line
            x1={x(stageAt)}
            x2={x(stageAt)}
            y1={top}
            y2={bottom}
            style={{ stroke: 'var(--label)' }}
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <text className="chart__ar" x={x(stageAt) + 5} y={bottom - 8} style={{ fontSize: 10 }}>
            {stageLabel}
          </text>
        </g>
      ) : null}
      {series.map((s) => (
        <polyline
          key={s.kind}
          points={s.values.map((value, epoch) => `${x(epoch).toFixed(1)},${y(value).toFixed(1)}`).join(' ')}
          fill="none"
          style={{ stroke: s.kind === 'val' ? 'var(--text)' : 'var(--label)' }}
          strokeWidth={s.kind === 'val' ? 2 : 1.25}
          strokeDasharray={s.kind === 'val' ? undefined : '4 3'}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
