import { mixHex } from '@/lib/color';
import { contourPath, levels, makeField } from '@/lib/contours';

const TONES = ['#dce9d4', '#a9ca9c', '#6c9a68', '#3a6344', '#1c3a2a', '#11271b', '#08160e'];

function tone(t: number): string {
  const pos = t * (TONES.length - 1);
  const i = Math.min(TONES.length - 2, Math.floor(pos));
  return mixHex(TONES[i], TONES[i + 1], pos - i);
}

interface Props {
  seed: number;
  width: number;
  height: number;
  /** Number of contour heights. */
  count?: number;
  /** plates: stacked tonal sheets, deeper is darker. lines: strokes in currentColor. */
  mode?: 'plates' | 'lines';
  hills?: number;
  island?: boolean;
  className?: string;
}

/** Decorative topography. Groups carry --d so a Parallax parent can slide them apart. */
export function Terrain({
  seed,
  width,
  height,
  count = 12,
  mode = 'plates',
  hills,
  island = true,
  className,
}: Props) {
  const cell = 22;
  const field = makeField({
    seed,
    cols: Math.round(width / cell) + 1,
    rows: Math.round(height / cell) + 1,
    hills,
    island,
  });
  const paths = levels(count).map((level) => contourPath(field, level, width, height));
  const groups = 3;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: groups }, (_, g) => (
        <g key={g} className="depth" style={{ '--d': (g + 1) * 14 } as React.CSSProperties}>
          {paths.map((d, k) =>
            Math.min(groups - 1, Math.floor((k / count) * groups)) === g && d ? (
              mode === 'plates' ? (
                <path
                  key={k}
                  d={d}
                  fill={tone(k / (count - 1))}
                  fillRule="evenodd"
                  stroke={k / (count - 1) > 0.55 ? '#3a6344' : '#eef4e9'}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <path
                  key={k}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )
            ) : null,
          )}
        </g>
      ))}
    </svg>
  );
}
