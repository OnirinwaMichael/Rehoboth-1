import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const KEY = 'standard_consultation_fee';

export interface StandardFeeState {
  fee: number | null;          // null = not set yet
  updatedByName: string | null;
  updatedAt: string | null;
  loading: boolean;
  save: (amount: number) => Promise<{ ok: boolean; message?: string }>;
}

// The clinic-wide standard consultation fee. Stays at the saved amount until someone changes it.
export function useStandardFee(): StandardFeeState {
  const [fee, setFee] = useState<number | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = (row: any) => {
    setFee(row && row.value_numeric !== null && row.value_numeric !== undefined ? Number(row.value_numeric) : null);
    setUpdatedByName(row?.updated_by_name ?? null);
    setUpdatedAt(row?.updated_at ?? null);
  };

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_settings').select('*').eq('key', KEY).maybeSingle();
    if (error) { console.error('[app_settings:select]', error.message); setLoading(false); return; }
    apply(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('standard-fee')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload: any) => {
        if (payload.new?.key === KEY) apply(payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const save = useCallback(async (amount: number) => {
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: 'Enter a valid amount (0 or more).' };
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: KEY, value_numeric: amount }, { onConflict: 'key' });
    if (error) {
      console.error('[app_settings:upsert]', error.message);
      return { ok: false, message: 'Could not save the fee. Please try again.' };
    }
    await load();
    return { ok: true };
  }, [load]);

  return { fee, updatedByName, updatedAt, loading, save };
}
