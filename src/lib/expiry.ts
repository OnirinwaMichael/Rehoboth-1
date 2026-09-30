// Expiry helpers for drug stock. Dates are plain calendar dates (YYYY-MM-DD) compared against
// today's date in Nigeria, matching the database rule: the expiry date itself is still valid.
export const EXPIRY_WARNING_DAYS = 90;

export type ExpiryState = 'none' | 'expired' | 'soon' | 'ok';
export interface ExpiryStatus { state: ExpiryState; daysLeft: number | null }

const todayLagos = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(now); // YYYY-MM-DD

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

export function expiryStatus(date?: string | null, now: Date = new Date()): ExpiryStatus {
  if (!date) return { state: 'none', daysLeft: null };
  const daysLeft = dayNumber(date.slice(0, 10)) - dayNumber(todayLagos(now));
  if (daysLeft < 0) return { state: 'expired', daysLeft };
  if (daysLeft <= EXPIRY_WARNING_DAYS) return { state: 'soon', daysLeft };
  return { state: 'ok', daysLeft };
}

export const formatExpiry = (date: string) =>
  new Date(date.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
