import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from './supabase';

// Watches pending_bills_summary() for the receptionist/CMD: keeps a live count of patients
// with unpaid bills (for the sidebar badge) and pops a toast when a patient's outstanding
// amount goes UP, i.e. a new test, drug or fee was just billed. Paying only lowers the
// amount, so payments never trigger it. The first load is silent.
export const usePendingBillsAlert = (enabled: boolean) => {
  const [patients, setPatients] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let first = true;
    let prev = new Map<string, number>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc('pending_bills_summary');
      if (error || cancelled) return;
      const rows: any[] = data || [];
      const next = new Map<string, number>();
      const raised: { name: string; kinds: string; amount: number }[] = [];
      for (const r of rows) {
        const outstanding = Number(r.outstanding) || 0;
        next.set(r.patient_id, outstanding);
        if (!first && outstanding > (prev.get(r.patient_id) ?? 0) + 0.5) {
          raised.push({ name: r.patient_name, kinds: r.kinds || 'Bill', amount: outstanding });
        }
      }
      raised.slice(0, 3).forEach(b =>
        toast.info(`New unpaid bill: ${b.name}`, { description: `${b.kinds} · ₦${b.amount.toLocaleString()} outstanding`, duration: 8000 }));
      if (raised.length > 3) toast.info(`${raised.length - 3} more patients have new unpaid bills.`, { duration: 8000 });
      first = false;
      prev = next;
      setPatients(rows.length);
    };

    // One action can touch several tables, so refresh once after the burst.
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(load, 600); };

    load();
    const channel = supabase
      .channel('pending-bills-alert')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financials' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_tests' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, schedule)
      .subscribe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return patients;
};
