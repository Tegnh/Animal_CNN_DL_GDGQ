// Colour mixing done in code, so no page depends on the CSS color-mix() function
// (Safari 16.2+ only) for anything that has to be visible.
const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** `from` at 1 - t plus `to` at t, as a comma-separated rgb() string. */
export function mixHex(from: string, to: string, t: number): string {
  const parts = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t));
  return `rgb(${parts.join(', ')})`;
}
