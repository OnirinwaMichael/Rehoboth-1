// Idle auto-logout settings and the shared "last activity" timestamp (shared across tabs).
export const ACTIVITY_KEY = 'hms.lastActivity';
export const IDLE_LIMIT_MS = 10 * 60 * 1000; // signed out after 10 minutes with no activity
export const IDLE_WARNING_MS = 60 * 1000;    // warning shown for the last 60 seconds

export function readLastActivity(): number | null {
  try {
    const n = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

export function touchActivity(now: number = Date.now()) {
  try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* storage unavailable: fine */ }
}

export function clearActivity() {
  try { localStorage.removeItem(ACTIVITY_KEY); } catch { /* storage unavailable: fine */ }
}
