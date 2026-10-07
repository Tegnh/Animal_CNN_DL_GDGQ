// Western digits everywhere, so numbers line up with the mono face.
export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function int(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function num(value: number, digits = 2): string {
  return value.toFixed(digits);
}

/** 1e-05 -> "0.00001" without floating-point tails. */
export function plain(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 0.001) return String(Number(value.toPrecision(6)));
  return value.toFixed(Math.ceil(-Math.log10(abs)) + 1).replace(/0+$/, '');
}
