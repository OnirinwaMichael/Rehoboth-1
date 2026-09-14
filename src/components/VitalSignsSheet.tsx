import React, { useEffect, useState } from 'react';
import { Patient, Admission, VitalSignEntry } from '../types';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';
import { FullScreenSheet } from './FullScreenSheet';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { toast } from 'sonner';

interface Props {
  patient: Patient;
  admission: Admission;
  userId: string;
  onClose: () => void;
}

const TIME_SLOTS: VitalSignEntry['timeOfDay'][] = ['Night', 'Morning', 'Afternoon'];

const vitalSignFromRow = (r: any): VitalSignEntry => ({
  id: r.id, admissionId: r.admission_id, patientId: r.patient_id, entryDate: r.entry_date,
  timeOfDay: r.time_of_day, temperature: r.temperature, pulse: r.pulse,
  respiration: r.respiration, bloodPressure: r.blood_pressure,
  recordedBy: r.recorded_by, createdAt: r.created_at,
});

export const VitalSignsSheet: React.FC<Props> = ({ patient, admission, userId, onClose }) => {
  const [entries, setEntries] = useState<VitalSignEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [draft, setDraft] = useState<Record<string, { temperature: string; pulse: string; respiration: string; bloodPressure: string }>>({
    Night: { temperature: '', pulse: '', respiration: '', bloodPressure: '' },
    Morning: { temperature: '', pulse: '', respiration: '', bloodPressure: '' },
    Afternoon: { temperature: '', pulse: '', respiration: '', bloodPressure: '' },
  });

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('vital_signs_entries')
      .select('*')
      .eq('admission_id', admission.id)
      .order('entry_date', { ascending: false });
    if (error) { handleSupabaseError(error, 'select', 'vital_signs_entries'); setLoading(false); return; }
    setEntries((data || []).map(vitalSignFromRow));
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
    const channel = supabase
      .channel(`vital-signs-${admission.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vital_signs_entries', filter: `admission_id=eq.${admission.id}` }, fetchEntries)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  const handleSaveSlot = async (timeOfDay: string) => {
    const slot = draft[timeOfDay];
    if (!slot.temperature && !slot.pulse && !slot.respiration && !slot.bloodPressure) {
      toast.error('Enter at least one reading.');
      return;
    }
    const { error } = await supabase.from('vital_signs_entries').upsert({
      admission_id: admission.id,
      patient_id: patient.cardId,
      entry_date: newDate,
      time_of_day: timeOfDay,
      temperature: slot.temperature || null,
      pulse: slot.pulse || null,
      respiration: slot.respiration || null,
      blood_pressure: slot.bloodPressure || null,
      recorded_by: userId,
    }, { onConflict: 'admission_id,entry_date,time_of_day' });
    if (error) return handleSupabaseError(error, 'insert', 'vital_signs_entries');
    toast.success(`${timeOfDay} reading saved.`);
    setDraft({ ...draft, [timeOfDay]: { temperature: '', pulse: '', respiration: '', bloodPressure: '' } });
  };

  const grouped = entries.reduce<Record<string, VitalSignEntry[]>>((acc, e) => {
    (acc[e.entryDate] = acc[e.entryDate] || []).push(e);
    return acc;
  }, {});

  return (
    <FullScreenSheet title="Vital Signs" subtitle={patient.name} onClose={onClose}>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Record Reading</p>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="p-2 text-sm border border-slate-200 rounded-lg outline-none"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1"></th>
                  {TIME_SLOTS.map(slot => (
                    <th key={slot} className="px-2 py-1 text-center bg-slate-700 text-white rounded-t-lg">{slot}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['temperature', 'pulse', 'respiration', 'bloodPressure'] as const).map((field, i) => (
                  <tr key={field}>
                    <td className="px-2 py-1 font-bold text-slate-500 whitespace-nowrap">
                      {['Temp', 'Pulse', 'Resp', 'BP'][i]}
                    </td>
                    {TIME_SLOTS.map(slot => (
                      <td key={slot} className="p-1">
                        <input
                          value={draft[slot][field]}
                          onChange={e => setDraft({ ...draft, [slot]: { ...draft[slot], [field]: e.target.value } })}
                          className="w-full p-2 text-center border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td></td>
                  {TIME_SLOTS.map(slot => (
                    <td key={slot} className="p-1">
                      <button
                        onClick={() => handleSaveSlot(slot)}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-[10px] hover:bg-blue-700"
                      >
                        Save {slot}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <p className="text-center text-slate-400 text-sm py-8">Loading...</p>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Activity className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No readings recorded yet.</p>
            </div>
          ) : (
            Object.entries(grouped).map(([date, dayEntries]: [string, VitalSignEntry[]]) => (
              <div key={date} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-700 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">
                  {format(new Date(date), 'EEEE, MMM d, yyyy')}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-2 py-1 text-left">Time</th>
                        <th className="px-2 py-1">Temp</th>
                        <th className="px-2 py-1">Pulse</th>
                        <th className="px-2 py-1">Resp</th>
                        <th className="px-2 py-1">BP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map(slot => {
                        const entry = dayEntries.find(e => e.timeOfDay === slot);
                        return (
                          <tr key={slot} className="border-t border-slate-100">
                            <td className="px-2 py-2 font-bold text-slate-700">{slot}</td>
                            <td className="px-2 py-2 text-center">{entry?.temperature || '—'}</td>
                            <td className="px-2 py-2 text-center">{entry?.pulse || '—'}</td>
                            <td className="px-2 py-2 text-center">{entry?.respiration || '—'}</td>
                            <td className="px-2 py-2 text-center">{entry?.bloodPressure || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FullScreenSheet>
  );
};
