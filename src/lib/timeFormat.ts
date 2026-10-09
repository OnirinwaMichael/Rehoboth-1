import { useSyncExternalStore } from 'react';
import { format } from 'date-fns';
import { supabase } from './supabase';

// Clinic-wide 12-hour / 24-hour display setting (app_settings, key 'time_format').
// 12-hour is the default: it is what shows when no value has been saved.
export type TimeFormat = '12h' | '24h';

const SETTING_KEY = 'time_format';
const CACHE_KEY = 'hms.timeFormat'; // last known clinic value, only to avoid a flash on reload

export const parseTimeFormat = (value: unknown): TimeFormat => (value === '24h' ? '24h' : '12h');

function readCache(): TimeFormat {
  try { return parseTimeFormat(localStorage.getItem(CACHE_KEY)); } catch { return '12h'; }
}

let current: TimeFormat = readCache();
const listeners = new Set<() => void>();

export const getTimeFormat = (): TimeFormat => current;

export function applyTimeFormat(next: TimeFormat) {
  if (next === current) return;
  current = next;
  try { localStorage.setItem(CACHE_KEY, next); } catch { /* storage unavailable: fine */ }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// Re-renders the calling component whenever the clinic changes the setting.
export const useTimeFormat = (): TimeFormat => useSyncExternalStore(subscribe, getTimeFormat, getTimeFormat);

// Same patterns as date-fns, but the time tokens 'HH:mm:ss' / 'HH:mm' follow the clinic setting.
export function fmtTime(date: Date | string | number, pattern: string): string {
  const p = current === '12h'
    ? pattern.replace('HH:mm:ss', 'h:mm:ss a').replace('HH:mm', 'h:mm a')
    : pattern;
  return format(new Date(date), p);
}

// CMD only (enforced by the database policies as well as the UI).
export async function saveTimeFormat(next: TimeFormat): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SETTING_KEY, value_text: next }, { onConflict: 'key' });
  if (error) {
    console.error('[app_settings:time_format]', error.message);
    return { ok: false, message: 'Could not save the time format. Only the CMD can change it.' };
  }
  applyTimeFormat(next);
  return { ok: true };
}

export const TIME_FORMAT_SETTING_KEY = SETTING_KEY;
