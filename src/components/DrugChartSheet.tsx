import React, { useEffect, useState } from 'react';
import { Patient, Admission, DrugChartEntry } from '../types';
import { format } from 'date-fns';
import { Plus, Pill } from 'lucide-react';
import { FullScreenSheet } from './FullScreenSheet';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { toast } from 'sonner';
import { VoiceDictationButton } from './VoiceDictationButton';

interface Props {
  patient: Patient;
  admission: Admission;
  userId: string;
  onClose: () => void;
}

const drugChartEntryFromRow = (r: any): DrugChartEntry => ({
  id: r.id, admissionId: r.admission_id, patientId: r.patient_id, entryDate: r.entry_date,
  drugName: r.drug_name, dose: r.dose, timeGiven: r.time_given,
  administeredBy: r.administered_by, notes: r.notes, createdAt: r.created_at,
});

export const DrugChartSheet: React.FC<Props> = ({ patient, admission, userId, onClose }) => {
  const [entries, setEntries] = useState<DrugChartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ drugName: '', dose: '', timeGiven: '', notes: '' });

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('drug_chart_entries')
      .select('*')
      .eq('admission_id', admission.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { handleSupabaseError(error, 'select', 'drug_chart_entries'); setLoading(false); return; }
    setEntries((data || []).map(drugChartEntryFromRow));
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
    const channel = supabase
      .channel(`drug-chart-${admission.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drug_chart_entries', filter: `admission_id=eq.${admission.id}` }, fetchEntries)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  const handleAdd = async () => {
    if (!form.drugName.trim()) {
      toast.error('Enter a drug name.');
      return;
    }
    const { error } = await supabase.from('drug_chart_entries').insert({
      admission_id: admission.id,
      patient_id: patient.cardId,
      drug_name: form.drugName.trim(),
      dose: form.dose.trim() || null,
      time_given: form.timeGiven.trim() || null,
      notes: form.notes.trim() || null,
      administered_by: userId,
    });
    if (error) return handleSupabaseError(error, 'insert', 'drug_chart_entries');
    toast.success('Entry added to drug chart.');
    setForm({ drugName: '', dose: '', timeGiven: '', notes: '' });
  };

  const grouped = entries.reduce<Record<string, DrugChartEntry[]>>((acc, e) => {
    (acc[e.entryDate] = acc[e.entryDate] || []).push(e);
    return acc;
  }, {});

  return (
    <FullScreenSheet title="Drug Chart" subtitle={patient.name} onClose={onClose}>
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add Entry</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex items-center gap-2">
              <input
                value={form.drugName}
                onChange={e => setForm({ ...form, drugName: e.target.value })}
                placeholder="Drug name"
                className="flex-1 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <VoiceDictationButton size="md" onFinalResult={text => setForm({ ...form, drugName: text })} />
            </div>
            <input
              value={form.dose}
              onChange={e => setForm({ ...form, dose: e.target.value })}
              placeholder="Dose (e.g. 500mg)"
              className="p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <input
              value={form.timeGiven}
              onChange={e => setForm({ ...form, timeGiven: e.target.value })}
              placeholder="Time given (e.g. 8am)"
              className="p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <div className="col-span-2 flex items-center gap-2">
              <input
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="flex-1 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <VoiceDictationButton size="md" onFinalResult={text => setForm({ ...form, notes: (form.notes ? form.notes + ' ' : '') + text })} />
            </div>
          </div>
          <button
            onClick={handleAdd}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add to Chart
          </button>
        </div>

        <div className="space-y-4">
          {loading ? (
            <p className="text-center text-slate-400 text-sm py-8">Loading...</p>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Pill className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No entries yet.</p>
            </div>
          ) : (
            Object.entries(grouped).map(([date, dayEntries]: [string, DrugChartEntry[]]) => (
              <div key={date} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-700 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">
                  {format(new Date(date), 'EEEE, MMM d, yyyy')}
                </div>
                <div className="divide-y divide-slate-100">
                  {dayEntries.map(e => (
                    <div key={e.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{e.drugName}{e.dose ? ` — ${e.dose}` : ''}</p>
                        {e.notes && <p className="text-xs text-slate-400">{e.notes}</p>}
                      </div>
                      <span className="text-xs font-bold text-blue-600 shrink-0">{e.timeGiven || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FullScreenSheet>
  );
};
