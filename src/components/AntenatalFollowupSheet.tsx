import React, { useEffect, useState } from 'react';
import { Patient, AntenatalFollowup } from '../types';
import { format } from 'date-fns';
import { Plus, HeartPulse } from 'lucide-react';
import { FullScreenSheet } from './FullScreenSheet';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { toast } from 'sonner';
import { VoiceDictationButton } from './VoiceDictationButton';

interface Props {
  patient: Patient;
  userId: string;
  onClose: () => void;
}

const FIELDS: { key: keyof typeof EMPTY_FORM; label: string }[] = [
  { key: 'heightOfFundus', label: 'Height of Fundus' },
  { key: 'presentationPosition', label: 'Presentation and Position' },
  { key: 'foetalHeart', label: 'Foetal Heart' },
  { key: 'bloodPressure', label: 'Blood Pressure' },
  { key: 'urineTest', label: 'Urine Test' },
  { key: 'weight', label: 'Weight' },
  { key: 'hgbPcv', label: 'HGB/PCU' },
];

const EMPTY_FORM = {
  heightOfFundus: '', presentationPosition: '', foetalHeart: '', bloodPressure: '',
  urineTest: '', weight: '', hgbPcv: '', remarks: '', treatment: '',
};

const followupFromRow = (r: any): AntenatalFollowup => ({
  id: r.id, patientId: r.patient_id, visitDate: r.visit_date,
  heightOfFundus: r.height_of_fundus, presentationPosition: r.presentation_position,
  foetalHeart: r.foetal_heart, bloodPressure: r.blood_pressure, urineTest: r.urine_test,
  weight: r.weight, hgbPcv: r.hgb_pcv, remarks: r.remarks, treatment: r.treatment,
  recordedBy: r.recorded_by, createdAt: r.created_at,
});

export const AntenatalFollowupSheet: React.FC<Props> = ({ patient, userId, onClose }) => {
  const [entries, setEntries] = useState<AntenatalFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('antenatal_followups')
      .select('*')
      .eq('patient_id', patient.cardId)
      .order('visit_date', { ascending: false });
    if (error) { handleSupabaseError(error, 'select', 'antenatal_followups'); setLoading(false); return; }
    setEntries((data || []).map(followupFromRow));
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
    const channel = supabase
      .channel(`antenatal-followup-${patient.cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antenatal_followups', filter: `patient_id=eq.${patient.cardId}` }, fetchEntries)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.cardId]);

  const handleAdd = async () => {
    const hasAnything = Object.values(form).some((v: string) => v.trim());
    if (!hasAnything) {
      toast.error('Enter at least one field.');
      return;
    }
    const { error } = await supabase.from('antenatal_followups').insert({
      patient_id: patient.cardId,
      height_of_fundus: form.heightOfFundus || null,
      presentation_position: form.presentationPosition || null,
      foetal_heart: form.foetalHeart || null,
      blood_pressure: form.bloodPressure || null,
      urine_test: form.urineTest || null,
      weight: form.weight || null,
      hgb_pcv: form.hgbPcv || null,
      remarks: form.remarks || null,
      treatment: form.treatment || null,
      recorded_by: userId,
    });
    if (error) return handleSupabaseError(error, 'insert', 'antenatal_followups');
    toast.success('Follow-up visit recorded.');
    setForm(EMPTY_FORM);
  };

  return (
    <FullScreenSheet title="Antenatal Follow-up" subtitle={patient.name} onClose={onClose}>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Visit</p>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-bold text-slate-500">{f.label}</label>
                <input
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500">Remarks</label>
            <div className="flex items-center gap-2">
              <input
                value={form.remarks}
                onChange={e => setForm({ ...form, remarks: e.target.value })}
                className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
              />
              <VoiceDictationButton size="md" onFinalResult={text => setForm({ ...form, remarks: (form.remarks ? form.remarks + ' ' : '') + text })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500">Treatment</label>
            <div className="flex items-center gap-2">
              <input
                value={form.treatment}
                onChange={e => setForm({ ...form, treatment: e.target.value })}
                className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
              />
              <VoiceDictationButton size="md" onFinalResult={text => setForm({ ...form, treatment: (form.treatment ? form.treatment + ' ' : '') + text })} />
            </div>
          </div>
          <button
            onClick={handleAdd}
            className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold text-sm hover:bg-pink-700 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Record Visit
          </button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <p className="text-center text-slate-400 text-sm py-8">Loading...</p>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <HeartPulse className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No follow-up visits recorded yet.</p>
            </div>
          ) : (
            entries.map(e => (
              <div key={e.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-700 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">
                  {format(new Date(e.visitDate), 'EEEE, MMM d, yyyy')}
                </div>
                <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {FIELDS.map(f => (
                    <div key={f.key}>
                      <span className="font-bold text-slate-500">{f.label}: </span>
                      <span className="text-slate-700">{(e as any)[f.key] || '—'}</span>
                    </div>
                  ))}
                  {e.remarks && <div className="col-span-2"><span className="font-bold text-slate-500">Remarks: </span>{e.remarks}</div>}
                  {e.treatment && <div className="col-span-2"><span className="font-bold text-slate-500">Treatment: </span>{e.treatment}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FullScreenSheet>
  );
};
