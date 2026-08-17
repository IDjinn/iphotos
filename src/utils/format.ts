/** Formats video duration in seconds as "1:24". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "1,234 items" */
export function formatCount(n: number, singular = 'item', plural = 'items'): string {
  const label = n === 1 ? singular : plural;
  return `${n.toLocaleString('en-US')} ${label}`;
}
