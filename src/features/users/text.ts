import { formatDate } from '@/lib/format';
import type { AppUser } from './api';

/** The plan's minimum for a password (the web's MIN_PASSWORD_LENGTH; the server checks it and says so). */
export const MIN_PASSWORD_LENGTH = 8;

/** The role an Admin has: only an Admin changes an Admin's account (the server enforces it too). */
export const ADMIN_ROLE = 'Admin';

export const fullName = (user: Pick<AppUser, 'firstName' | 'lastName'>) => [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

/** The name to show: the full name, else the email or mobile number. */
export const displayName = (user: AppUser) => fullName(user) || user.email || user.phoneNo;

export const roleText = (user: AppUser) => user.roles?.map((r) => r.name).join(', ') || '—';

/** "name@company.com", or "+91 98765 43210 · no email". */
export const contactText = (user: AppUser) => user.email || [user.phoneNo && `+91 ${user.phoneNo}`, 'no email'].filter(Boolean).join(' · ');

const two = (n: number) => String(n).padStart(2, '0');

/** "Today, 09:12", "Yesterday, 18:40", else the date; "Never" before the first sign-in (the web's wording). */
export function signInText(value?: string | null): string {
  if (!value) return 'Never';
  const at = new Date(value);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
  if (sameDay(at, now)) return `Today, ${time}`;
  if (sameDay(at, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `Yesterday, ${time}`;
  return formatDate(value);
}
