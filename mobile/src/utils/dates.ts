/**
 * Date helpers kept dependency-free (no Intl dependency on Hermes)
 * and deterministic across platforms.
 */
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MS_PER_DAY = 86_400_000;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** "August 2026" */
export function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sat, Aug 16, 2026" — full date used in the viewer. */
export function fullDateLabel(ms: number): string {
  const d = new Date(ms);
  const weekday = WEEKDAYS[d.getDay()].slice(0, 3);
  return `${weekday}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Group header: "Today", "Yesterday", or "August 16, 2026". */
export function dayGroupLabel(ms: number, now = Date.now()): string {
  const today = startOfDay(now);
  const day = startOfDay(ms);
  if (day === today) return 'Today';
  if (day === today - MS_PER_DAY) return 'Yesterday';
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Clock time "3:42 PM". */
export function timeLabel(ms: number): string {
  const d = new Date(ms);
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

/** Stable month bucket key, e.g. "2026-08". */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * Start of the day one calendar month before `now` — the cutoff under
 * which photos group by month only (no per-day headers).
 */
export function oneMonthAgoStart(now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return startOfDay(d.getTime());
}

/** Human label for a month bucket key: "2026-08" → "August 2026"; "" → "Undated". */
export function monthBucketLabel(month: string): string {
  if (!month) return 'Undated';
  const [year, m] = month.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${year}`;
}

/** First millisecond of a month bucket key, in UTC ("2026-08" → ISO string). */
export function monthStartIso(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toISOString();
}

/** Last millisecond of a month bucket key, in UTC ("2026-08" → ISO string). */
export function monthEndIso(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 1) - 1).toISOString();
}
