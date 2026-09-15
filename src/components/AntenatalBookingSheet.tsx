import React, { useEffect, useState } from 'react';
import { Patient, AntenatalBooking, PreviousPregnancy } from '../types';
import { Save, Plus, X } from 'lucide-react';
import { FullScreenSheet } from './FullScreenSheet';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { toast } from 'sonner';
import { VoiceDictationButton } from './VoiceDictationButton';

interface Props {
  patient: Patient;
  userId: string;
  onClose: () => void;
}

const EMPTY_PREGNANCY: PreviousPregnancy = {
  year: '', duration: '', complication: '', whereDelivered: '', babyAliveOrDeath: '', ageAtDeath: '',
};

const bookingFromRow = (r: any): AntenatalBooking => ({
  id: r.id, patientId: r.patient_id, inPatientNo: r.in_patient_no, tribe: r.tribe,
  husbandOccupation: r.husband_occupation, pastMedicalHistory: r.past_medical_history,
  lmp: r.lmp, edd: r.edd, gravida: r.gravida, para: r.para, noAlive: r.no_alive, noDead: r.no_dead,
  abortion: r.abortion, previousPregnancies: r.previous_pregnancies || [],
  historyPresentPregnancy: r.history_present_pregnancy, examinationBreast: r.examination_breast,
  examinationHeight: r.examination_height, examinationCvs: r.examination_cvs,
  examinationPelvis: r.examination_pelvis, examinationAbdomen: r.examination_abdomen,
  examinationShape: r.examination_shape, examinationSize: r.examination_size,
  generalAppearance: r.general_appearance, createdBy: r.created_by,
  updatedAt: r.updated_at, createdAt: r.created_at,
});

export const AntenatalBookingSheet: React.FC<Props> = ({ patient, userId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    inPatientNo: '', tribe: '', husbandOccupation: '', pastMedicalHistory: '',
    lmp: '', edd: '', gravida: '', para: '', noAlive: '', noDead: '', abortion: '',
    historyPresentPregnancy: '', examinationBreast: '', examinationHeight: '',
    examinationCvs: '', examinationPelvis: '', examinationAbdomen: '',
    examinationShape: '', examinationSize: '', generalAppearance: '',
  });
  const [previousPregnancies, setPreviousPregnancies] = useState<PreviousPregnancy[]>([]);

  useEffect(() => {
    const fetchBooking = async () => {
      const { data, error } = await supabase
        .from('antenatal_bookings')
        .select('*')
        .eq('patient_id', patient.cardId)
        .maybeSingle();
      if (error) { handleSupabaseError(error, 'select', 'antenatal_bookings'); setLoading(false); return; }
      if (data) {
        const b = bookingFromRow(data);
        setForm({
          inPatientNo: b.inPatientNo || '', tribe: b.tribe || '', husbandOccupation: b.husbandOccupation || '',
          pastMedicalHistory: b.pastMedicalHistory || '', lmp: b.lmp || '', edd: b.edd || '',
          gravida: b.gravida || '', para: b.para || '', noAlive: b.noAlive || '', noDead: b.noDead || '',
          abortion: b.abortion || '', historyPresentPregnancy: b.historyPresentPregnancy || '',
          examinationBreast: b.examinationBreast || '', examinationHeight: b.examinationHeight || '',
          examinationCvs: b.examinationCvs || '', examinationPelvis: b.examinationPelvis || '',
          examinationAbdomen: b.examinationAbdomen || '', examinationShape: b.examinationShape || '',
          examinationSize: b.examinationSize || '', generalAppearance: b.generalAppearance || '',
        });
        setPreviousPregnancies(b.previousPregnancies.length > 0 ? b.previousPregnancies : []);
      }
      setLoading(false);
    };
    fetchBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.cardId]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      patient_id: patient.cardId,
      in_patient_no: form.inPatientNo || null,
      tribe: form.tribe || null,
      husband_occupation: form.husbandOccupation || null,
      past_medical_history: form.pastMedicalHistory || null,
      lmp: form.lmp || null,
      edd: form.edd || null,
      gravida: form.gravida || null,
      para: form.para || null,
      no_alive: form.noAlive || null,
      no_dead: form.noDead || null,
      abortion: form.abortion || null,
      previous_pregnancies: previousPregnancies,
      history_present_pregnancy: form.historyPresentPregnancy || null,
      examination_breast: form.examinationBreast || null,
      examination_height: form.examinationHeight || null,
      examination_cvs: form.examinationCvs || null,
      examination_pelvis: form.examinationPelvis || null,
      examination_abdomen: form.examinationAbdomen || null,
      examination_shape: form.examinationShape || null,
      examination_size: form.examinationSize || null,
      general_appearance: form.generalAppearance || null,
      created_by: userId,
    };
    const { error } = await supabase.from('antenatal_bookings').upsert(payload, { onConflict: 'patient_id' });
    setSaving(false);
    if (error) return handleSupabaseError(error, 'insert', 'antenatal_bookings');
    toast.success('Antenatal booking saved.');
  };

  const updatePregnancy = (index: number, patch: Partial<PreviousPregnancy>) => {
    const updated = [...previousPregnancies];
    updated[index] = { ...updated[index], ...patch };
    setPreviousPregnancies(updated);
  };

  const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; voice?: boolean; type?: string }> = ({ label, value, onChange, voice, type }) => (
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={type || 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
        />
        {voice && <VoiceDictationButton onFinalResult={text => onChange((value ? value + ' ' : '') + text)} />}
      </div>
    </div>
  );

  if (loading) {
    return (
      <FullScreenSheet title="Antenatal Booking" subtitle={patient.name} onClose={onClose}>
        <p className="text-center text-slate-400 text-sm py-12">Loading...</p>
      </FullScreenSheet>
    );
  }

  return (
    <FullScreenSheet
      title="Antenatal Booking"
      subtitle={patient.name}
      onClose={onClose}
      headerActions={
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 bg-pink-600 text-white rounded-lg font-bold text-xs hover:bg-pink-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      }
    >
      <div className="max-w-3xl mx-auto p-4 space-y-6 pb-24">
        <div className="grid grid-cols-2 gap-3">
          <Field label="In-patient No" value={form.inPatientNo} onChange={v => setForm({ ...form, inPatientNo: v })} />
          <Field label="Tribe" value={form.tribe} onChange={v => setForm({ ...form, tribe: v })} />
          <Field label="Husband's Occupation" value={form.husbandOccupation} onChange={v => setForm({ ...form, husbandOccupation: v })} />
          <Field label="LMP" value={form.lmp} onChange={v => setForm({ ...form, lmp: v })} type="date" />
          <Field label="EDD" value={form.edd} onChange={v => setForm({ ...form, edd: v })} type="date" />
          <Field label="Gravida" value={form.gravida} onChange={v => setForm({ ...form, gravida: v })} />
          <Field label="Para" value={form.para} onChange={v => setForm({ ...form, para: v })} />
          <Field label="No Alive" value={form.noAlive} onChange={v => setForm({ ...form, noAlive: v })} />
          <Field label="No Dead" value={form.noDead} onChange={v => setForm({ ...form, noDead: v })} />
          <Field label="Abortion" value={form.abortion} onChange={v => setForm({ ...form, abortion: v })} />
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Past Medical or Surgical History</label>
          <div className="flex items-center gap-2">
            <textarea
              value={form.pastMedicalHistory}
              onChange={e => setForm({ ...form, pastMedicalHistory: e.target.value })}
              className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 min-h-[60px]"
            />
            <VoiceDictationButton onFinalResult={text => setForm({ ...form, pastMedicalHistory: (form.pastMedicalHistory ? form.pastMedicalHistory + ' ' : '') + text })} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Previous Pregnancy</p>
            <button
              onClick={() => setPreviousPregnancies([...previousPregnancies, { ...EMPTY_PREGNANCY }])}
              className="flex items-center gap-1 text-xs font-bold text-blue-600"
            >
              <Plus className="w-3 h-3" /> Add Row
            </button>
          </div>
          {previousPregnancies.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No previous pregnancies recorded.</p>
          ) : (
            <div className="space-y-2">
              {previousPregnancies.map((p, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Row {i + 1}</span>
                    <button onClick={() => setPreviousPregnancies(previousPregnancies.filter((_, idx) => idx !== i))} className="p-1 text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p.year} onChange={e => updatePregnancy(i, { year: e.target.value })} placeholder="Year" className="p-2 text-xs border border-slate-200 rounded-lg outline-none" />
                    <input value={p.duration} onChange={e => updatePregnancy(i, { duration: e.target.value })} placeholder="Duration of Pregnancy" className="p-2 text-xs border border-slate-200 rounded-lg outline-none" />
                    <input value={p.complication} onChange={e => updatePregnancy(i, { complication: e.target.value })} placeholder="Complication" className="col-span-2 p-2 text-xs border border-slate-200 rounded-lg outline-none" />
                    <input value={p.whereDelivered} onChange={e => updatePregnancy(i, { whereDelivered: e.target.value })} placeholder="Where Delivered" className="p-2 text-xs border border-slate-200 rounded-lg outline-none" />
                    <input value={p.babyAliveOrDeath} onChange={e => updatePregnancy(i, { babyAliveOrDeath: e.target.value })} placeholder="Baby Alive or Death" className="p-2 text-xs border border-slate-200 rounded-lg outline-none" />
                    <input value={p.ageAtDeath} onChange={e => updatePregnancy(i, { ageAtDeath: e.target.value })} placeholder="Age at Death" className="col-span-2 p-2 text-xs border border-slate-200 rounded-lg outline-none" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">History of Present Pregnancy</label>
          <div className="flex items-center gap-2">
            <textarea
              value={form.historyPresentPregnancy}
              onChange={e => setForm({ ...form, historyPresentPregnancy: e.target.value })}
              className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 min-h-[60px]"
            />
            <VoiceDictationButton onFinalResult={text => setForm({ ...form, historyPresentPregnancy: (form.historyPresentPregnancy ? form.historyPresentPregnancy + ' ' : '') + text })} />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Examination</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breast" value={form.examinationBreast} onChange={v => setForm({ ...form, examinationBreast: v })} />
            <Field label="Height" value={form.examinationHeight} onChange={v => setForm({ ...form, examinationHeight: v })} />
            <Field label="CVS" value={form.examinationCvs} onChange={v => setForm({ ...form, examinationCvs: v })} />
            <Field label="Pelvis" value={form.examinationPelvis} onChange={v => setForm({ ...form, examinationPelvis: v })} />
            <Field label="Abdomen" value={form.examinationAbdomen} onChange={v => setForm({ ...form, examinationAbdomen: v })} />
            <Field label="Shape" value={form.examinationShape} onChange={v => setForm({ ...form, examinationShape: v })} />
            <Field label="Size" value={form.examinationSize} onChange={v => setForm({ ...form, examinationSize: v })} />
          </div>
          <Field label="General Appearance" value={form.generalAppearance} onChange={v => setForm({ ...form, generalAppearance: v })} voice />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Booking'}
        </button>
      </div>
    </FullScreenSheet>
  );
};
