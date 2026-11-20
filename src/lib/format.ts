// Number and date wording, the same as the web (client/src/utils/dates.ts, features/dashboard/utils/format.ts).
// Written by hand, not with Intl, so every phone shows the same text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** ₹1,23,456: whole rupees, Indian digit grouping. */
export function formatINR(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(value)));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${sign}₹${grouped}`;
}

const two = (n: number) => String(n).padStart(2, '0');

/** 06 Oct 2026 ("—" when there is none). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${two(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** 06 Oct */
export const formatDayMonth = (value: string | Date) => {
  const date = new Date(value);
  return `${two(date.getDate())} ${MONTHS[date.getMonth()]}`;
};

export const weekdayName = (date: Date) => WEEKDAYS[date.getDay()]!;

/** How many whole days ago a date was (negative for a day still to come). */
export function daysAgo(iso: string, now = new Date()): number {
  const day = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(now) - start(day)) / DAY_MS);
}

/** "Good morning" / "Good afternoon" / "Good evening", by the hour. */
export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** ₹1,23,456.50: with paise, Indian digit grouping (document lines and totals). */
export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const [whole, paise] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${formatINR(Number(whole)).replace('-', '')}.${paise}`;
}

/** A quantity with up to 2 decimals and no trailing zeros: 12, 2.5. */
export const formatQty = (value: number | string) => String(Number(Number(value).toFixed(2)));

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** November */
export const monthName = (date: Date) => MONTH_NAMES[date.getMonth()]!;

/** "RA" for "Rana Advanced Systems": the first letters of the first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}
