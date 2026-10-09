import React, { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, getInFlightWrites } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  IDLE_SETTING_KEYS, IDLE_WARNING_MS, applyIdleRow, clearActivity, idleMinutesForRole, readLastActivity, touchActivity,
} from '../lib/idle';

// Any of these counts as activity. 'app:activity' is fired by things that are activity but
// produce no pointer/keyboard events (e.g. voice dictation).
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'input', 'app:activity'];

// Signs the user out after the clinic's idle timeout (10 minutes unless the CMD changed it; Doctors
// and Nurses have their own setting), with a 60-second warning first.
// - Activity in any open tab keeps every tab alive (shared timestamp in localStorage).
// - A save, payment or upload that is still in flight is never cut off.
// - Drafts are flushed to the device just before sign-out.
// - Coming back to a sleeping phone/tab after the limit signs out straight away.
export const IdleLogout: React.FC = () => {
  const { user, logout } = useAuth();
  const signedIn = !!user;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastRef = useRef<number>(Date.now());
  const lastWriteRef = useRef(0);
  const warningRef = useRef(false);
  const loggingOutRef = useRef(false);
  const roleRef = useRef<string | null>(null);
  roleRef.current = user?.role ?? null;
  const uid = user?.id;

  // Load the clinic's timeouts and follow live changes made by the CMD.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('app_settings').select('key, value_numeric').in('key', Object.values(IDLE_SETTING_KEYS));
      if (cancelled) return;
      if (error) { console.error('[app_settings:idle_timeout:select]', error.message); return; }
      (data || []).forEach(applyIdleRow);
    })();
    const channel = supabase
      .channel('idle-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload: any) => applyIdleRow(payload.new))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [uid]);

  const markActivity = (force = false) => {
    if (warningRef.current && !force) return; // while warning, only the button counts
    const now = Date.now();
    lastRef.current = now;
    if (force || now - lastWriteRef.current > 2000) {
      lastWriteRef.current = now;
      touchActivity(now);
    }
  };

  const stay = () => {
    warningRef.current = false;
    setSecondsLeft(null);
    markActivity(true);
  };

  useEffect(() => {
    if (!signedIn) {
      warningRef.current = false;
      loggingOutRef.current = false;
      setSecondsLeft(null);
      return;
    }
    const stored = readLastActivity();
    lastRef.current = stored ?? Date.now();
    if (stored === null) touchActivity(lastRef.current);

    const onActivity = () => markActivity(false);
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { capture: true, passive: true }));

    const signOutNow = async (minutes: number) => {
      loggingOutRef.current = true;
      warningRef.current = false;
      setSecondsLeft(null);
      window.dispatchEvent(new Event('app:flush-drafts'));
      clearActivity();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        // Offline: the server call failed, so wipe the stored session here and reload to the login page.
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
            .forEach((k) => localStorage.removeItem(k));
        } catch { /* storage unavailable: fine */ }
        window.location.assign('/');
        return;
      }
      toast.info(`You were signed out after ${minutes} minutes of inactivity. Please sign in again.`);
    };

    const tick = () => {
      if (loggingOutRef.current) return;
      const shared = readLastActivity();
      if (shared && shared > lastRef.current) lastRef.current = shared; // activity in another tab
      const idle = Date.now() - lastRef.current;
      const minutes = idleMinutesForRole(roleRef.current);
      const limitMs = minutes * 60 * 1000;
      if (idle >= limitMs) {
        if (getInFlightWrites() > 0) { markActivity(true); return; } // never cut off a save in progress
        void signOutNow(minutes);
        return;
      }
      if (idle >= limitMs - IDLE_WARNING_MS) {
        warningRef.current = true;
        setSecondsLeft(Math.max(1, Math.ceil((limitMs - idle) / 1000)));
      } else if (warningRef.current) {
        warningRef.current = false;
        setSecondsLeft(null);
      }
    };

    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(tick, 1000);
    tick();
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true } as EventListenerOptions));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [signedIn]);

  if (!signedIn || secondsLeft === null) return null;
  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 id="idle-title" className="text-lg font-bold text-slate-900">Still there?</h2>
        <p className="text-sm text-slate-600">
          For security you will be signed out in{' '}
          <span className="font-bold text-slate-900">{secondsLeft}s</span> because there has been no activity.
          Drafts in progress are saved on this device.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => { void logout(); }}
            className="flex-1 min-h-12 px-4 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Log out now
          </button>
          <button
            type="button"
            autoFocus
            onClick={stay}
            className="flex-1 min-h-12 px-4 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
};
