import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { applyTimeFormat, parseTimeFormat, TIME_FORMAT_SETTING_KEY } from '../lib/timeFormat';

// Loads the clinic-wide time format once someone is signed in and follows live changes.
export const TimeFormatSync: React.FC = () => {
  const { user } = useAuth();
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('app_settings').select('value_text').eq('key', TIME_FORMAT_SETTING_KEY).maybeSingle();
      if (cancelled) return;
      if (error) { console.error('[app_settings:time_format:select]', error.message); return; }
      applyTimeFormat(parseTimeFormat(data?.value_text));
    })();
    const channel = supabase
      .channel('time-format')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload: any) => {
        if (payload.new?.key === TIME_FORMAT_SETTING_KEY) applyTimeFormat(parseTimeFormat(payload.new.value_text));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [uid]);
  return null;
};
