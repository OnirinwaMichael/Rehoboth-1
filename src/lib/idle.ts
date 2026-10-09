import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// Idle auto-logout: shared "last activity" timestamp (shared across tabs) and the clinic-wide
// timeouts the CMD can change. With nothing saved, everyone gets 10 minutes.
export const ACTIVITY_KEY = 'hms.lastActivity';
export const IDLE_WARNING_MS = 60 * 1000; // warning shown for the last 60 seconds

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

// ---- Clinic-wide timeouts (app_settings, value_numeric = whole minutes, 5 to 120) ----
export const DEFAULT_IDLE_MINUTES = 10;
export const MIN_IDLE_MINUTES = 5;
export const MAX_IDLE_MINUTES = 120;
export const IDLE_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

export type IdleGroup = 'standard' | 'clinical';
export const IDLE_SETTING_KEYS: Record<IdleGroup, string> = {
  standard: 'idle_timeout_minutes',            // everyone except Doctors and Nurses
  clinical: 'idle_timeout_clinical_minutes',   // Doctors and Nurses
};

export interface IdleSettings { standard: number; clinical: number }

export const clampIdleMinutes = (value: unknown): number => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_IDLE_MINUTES;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, n));
};

const CACHE_KEY = 'hms.idleSettings'; // last known clinic values, so a reload never starts from the wrong limit

function readCache(): IdleSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return { standard: clampIdleMinutes(raw.standard), clinical: clampIdleMinutes(raw.clinical) };
  } catch { return { standard: DEFAULT_IDLE_MINUTES, clinical: DEFAULT_IDLE_MINUTES }; }
}

let settings: IdleSettings = readCache();
const listeners = new Set<() => void>();

export const getIdleSettings = (): IdleSettings => settings;

export function applyIdleSettings(next: Partial<IdleSettings>) {
  const merged: IdleSettings = {
    standard: next.standard !== undefined ? clampIdleMinutes(next.standard) : settings.standard,
    clinical: next.clinical !== undefined ? clampIdleMinutes(next.clinical) : settings.clinical,
  };
  if (merged.standard === settings.standard && merged.clinical === settings.clinical) return;
  settings = merged;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch { /* storage unavailable: fine */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useIdleSettings = (): IdleSettings => useSyncExternalStore(subscribe, getIdleSettings, getIdleSettings);

// Doctors and Nurses have their own timeout; every other role uses the standard one.
export const idleMinutesForRole = (role?: string | null): number =>
  role === 'Doctor' || role === 'Nurse' ? settings.clinical : settings.standard;

// Applies one row from app_settings (initial load or realtime change).
export function applyIdleRow(row: { key?: string; value_numeric?: unknown } | null | undefined) {
  if (!row) return;
  if (row.key === IDLE_SETTING_KEYS.standard) applyIdleSettings({ standard: clampIdleMinutes(row.value_numeric) });
  if (row.key === IDLE_SETTING_KEYS.clinical) applyIdleSettings({ clinical: clampIdleMinutes(row.value_numeric) });
}

// CMD only (enforced by the database policies as well as the UI).
export async function saveIdleMinutes(group: IdleGroup, minutes: number): Promise<{ ok: boolean; message?: string }> {
  const value = clampIdleMinutes(minutes);
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: IDLE_SETTING_KEYS[group], value_numeric: value }, { onConflict: 'key' });
  if (error) {
    console.error('[app_settings:idle_timeout]', error.message);
    return { ok: false, message: 'Could not save the timeout. Only the CMD can change it.' };
  }
  applyIdleSettings({ [group]: value } as Partial<IdleSettings>);
  return { ok: true };
}
