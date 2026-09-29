import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Save, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Patient, FamilyMember, LabRequestForm } from '../types';
import { CULTURE_SPECIMEN_TYPES } from '../data/labReportTemplates';
import { FullScreenSheet } from './FullScreenSheet';
import { VoiceDictationButton } from './VoiceDictationButton';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface EditorProps {
  patient: Patient;
  userId: string;
  initialFormId?: string;
  onChangePatient: () => void;
  onClose: () => void;
}

interface Props {
  userId: string;
  onClose: () => void;
}

const patientFromRow = (r: any): Patient => ({
  cardId: r.card_id, name: r.name, gender: r.gender,
  stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
  address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
  relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
  category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});

const formFromRow = (r: any): LabRequestForm => ({
  id: r.id, patientId: r.patient_id, familyMemberId: r.family_member_id,
  patientName: r.patient_name, sex: r.sex, age: r.age, hospitalClinic: r.hospital_clinic,
  ward: r.ward, no: r.no, clinicalHistory: r.clinical_history, consultant: r.consultant,
  provisionalDiagnosis: r.provisional_diagnosis, natureOfSpecimen: r.nature_of_specimen,
  testsRequired: r.tests_required, dateOfReception: r.date_of_reception, labNo: r.lab_no,
  labResult: r.lab_result, resultDate: r.result_date, labSecretary: r.lab_secretary,
  createdBy: r.created_by, updatedAt: r.updated_at, createdAt: r.created_at,
});

interface FormState {
  familyMemberId: string;
  patientName: string; sex: string; age: string;
  hospitalClinic: string; ward: string; no: string;
  clinicalHistory: string; consultant: string; provisionalDiagnosis: string;
  natureOfSpecimen: string; testsRequired: string;
  dateOfReception: string; labNo: string; labResult: string; resultDate: string; labSecretary: string;
}

const blankFor = (patient: Patient): FormState => ({
  familyMemberId: '',
  patientName: patient.name || '',
  sex: patient.gender === 'female' ? 'Female' : patient.gender === 'male' ? 'Male' : '',
  age: patient.age || '',
  hospitalClinic: '', ward: '', no: '',
  clinicalHistory: '', consultant: '', provisionalDiagnosis: '',
  natureOfSpecimen: '', testsRequired: '',
  dateOfReception: '', labNo: '', labResult: '', resultDate: '', labSecretary: '',
});

const stateFromForm = (f: LabRequestForm): FormState => ({
  familyMemberId: f.familyMemberId || '',
  patientName: f.patientName || '', sex: f.sex || '', age: f.age || '',
  hospitalClinic: f.hospitalClinic || '', ward: f.ward || '', no: f.no || '',
  clinicalHistory: f.clinicalHistory || '', consultant: f.consultant || '',
  provisionalDiagnosis: f.provisionalDiagnosis || '', natureOfSpecimen: f.natureOfSpecimen || '',
  testsRequired: f.testsRequired || '',
  dateOfReception: f.dateOfReception || '', labNo: f.labNo || '', labResult: f.labResult || '',
  resultDate: f.resultDate || '', labSecretary: f.labSecretary || '',
});

// One paper-style line: label on the left, an underlined input on the right.
const Line: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  list?: string; type?: string; className?: string; voice?: boolean; multiline?: boolean;
}> = ({ label, value, onChange, list, type, className, voice, multiline }) => (
  <div className={cn('flex items-end gap-2', className)}>
    <label className="text-sm font-semibold text-slate-700 whitespace-nowrap pb-1">{label}:</label>
    {multiline ? (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className="flex-1 min-w-0 bg-transparent border-b border-slate-400 px-1 py-1 text-sm text-slate-900 outline-none focus:border-blue-600 resize-y"
      />
    ) : (
      <input
        type={type || 'text'}
        list={list}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent border-b border-slate-400 px-1 py-1 text-sm text-slate-900 outline-none focus:border-blue-600"
      />
    )}
    {voice && <VoiceDictationButton onFinalResult={text => onChange((value ? value + ' ' : '') + text)} />}
  </div>
);

const ResultFormEditor: React.FC<EditorProps> = ({ patient, userId, initialFormId, onChangePatient, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forms, setForms] = useState<LabRequestForm[]>([]);
  const [selectedId, setSelectedId] = useState<string>('new');
  const [form, setForm] = useState<FormState>(() => blankFor(patient));
  const [dirty, setDirty] = useState(false);
  const [wards, setWards] = useState<string[]>([]);
  const [consultants, setConsultants] = useState<string[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const set = (patch: Partial<FormState>) => { setForm(prev => ({ ...prev, ...patch })); setDirty(true); };

  const fetchForms = async () => {
    const { data, error } = await supabase
      .from('lab_request_forms').select('*')
      .eq('patient_id', patient.cardId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[lab_request_forms:select]', error.message); toast.error('Could not load saved forms.'); return []; }
    const list = (data || []).map(formFromRow);
    setForms(list);
    return list;
  };

  useEffect(() => {
    (async () => {
      const list = await fetchForms();
      const initial = initialFormId ? list.find(x => x.id === initialFormId) : undefined;
      if (initial) { setForm(stateFromForm(initial)); setSelectedId(initial.id); }
      const [w, c, m] = await Promise.all([
        supabase.from('ward_catalog').select('name').order('sort_order', { ascending: true }).order('name', { ascending: true }),
        supabase.from('users').select('name').in('role', ['CMD', 'Doctor']).eq('status', 'active').order('name', { ascending: true }),
        supabase.from('family_members').select('*').eq('patient_id', patient.cardId).order('sort_order', { ascending: true }),
      ]);
      setWards((w.data || []).map((r: any) => r.name));
      setConsultants((c.data || []).map((r: any) => r.name));
      setMembers((m.data || []).map((r: any) => ({
        id: r.id, patientId: r.patient_id, name: r.name, sortOrder: r.sort_order, createdAt: r.created_at,
      })));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.cardId]);

  const confirmDiscard = () => !dirty || window.confirm('You have unsaved changes. Discard them?');

  const openForm = (id: string) => {
    if (id === selectedId || !confirmDiscard()) return;
    if (id === 'new') setForm(blankFor(patient));
    else { const f = forms.find(x => x.id === id); if (f) setForm(stateFromForm(f)); }
    setSelectedId(id);
    setDirty(false);
  };

  const handleClose = () => { if (confirmDiscard()) onClose(); };

  const pickMember = (memberId: string) => {
    if (!memberId) {
      const b = blankFor(patient);
      set({ familyMemberId: '', patientName: b.patientName, sex: b.sex, age: b.age });
      return;
    }
    const m = members.find(x => x.id === memberId);
    // Age and sex belong to the card holder, so they are left blank for a member.
    if (m) set({ familyMemberId: m.id, patientName: m.name, sex: '', age: '' });
  };

  const handleSave = async () => {
    const empty = (Object.keys(form) as (keyof FormState)[])
      .filter(k => k !== 'familyMemberId')
      .every(k => !form[k].trim());
    if (empty) { toast.error('The form is empty — fill in at least one field.'); return; }
    setSaving(true);
    const n = (v: string) => v.trim() || null;
    const payload = {
      patient_id: patient.cardId,
      family_member_id: form.familyMemberId || null,
      patient_name: n(form.patientName), sex: n(form.sex), age: n(form.age),
      hospital_clinic: n(form.hospitalClinic), ward: n(form.ward), no: n(form.no),
      clinical_history: n(form.clinicalHistory), consultant: n(form.consultant),
      provisional_diagnosis: n(form.provisionalDiagnosis), nature_of_specimen: n(form.natureOfSpecimen),
      tests_required: n(form.testsRequired),
      date_of_reception: form.dateOfReception || null, lab_no: n(form.labNo),
      lab_result: n(form.labResult), result_date: form.resultDate || null,
      lab_secretary: n(form.labSecretary),
    };
    if (selectedId === 'new') {
      const { data, error } = await supabase.from('lab_request_forms')
        .insert({ ...payload, created_by: userId, updated_by: userId }).select('id').single();
      setSaving(false);
      if (error || !data) { console.error('[lab_request_forms:insert]', error?.message); toast.error('Could not save the form. Please try again.'); return; }
      await fetchForms();
      setSelectedId(data.id);
    } else {
      const { error } = await supabase.from('lab_request_forms')
        .update({ ...payload, updated_by: userId }).eq('id', selectedId);
      setSaving(false);
      if (error) { console.error('[lab_request_forms:update]', error.message); toast.error('Could not save changes. Please try again.'); return; }
      await fetchForms();
    }
    setDirty(false);
    toast.success('Lab result form saved.');
  };

  const specimenSuggestions = useMemo(() => CULTURE_SPECIMEN_TYPES, []);

  return (
    <FullScreenSheet
      title="Lab Results"
      subtitle={`${patient.name} · Card ${patient.cardId}`}
      onClose={handleClose}
      headerActions={
        <>
        <button
          onClick={() => { if (confirmDiscard()) onChangePatient(); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          Change patient
        </button>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
        </button>
        </>
      }
    >
      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="max-w-[900px] mx-auto p-4 pb-24">
          {/* Saved forms for this patient */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
            <button
              onClick={() => openForm('new')}
              className={cn(
                'shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border',
                selectedId === 'new' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200'
              )}
            >
              <Plus className="w-3.5 h-3.5" /> New form
            </button>
            {forms.map(f => (
              <button
                key={f.id}
                onClick={() => openForm(f.id)}
                className={cn(
                  'shrink-0 px-3 py-2 rounded-lg text-xs font-bold border text-left max-w-[190px]',
                  selectedId === f.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                )}
              >
                <span className="block">{format(new Date(f.createdAt), 'MMM d, yyyy HH:mm')}</span>
                <span className="block font-normal opacity-70 truncate">{f.testsRequired || f.patientName || 'Untitled'}</span>
              </button>
            ))}
          </div>

          {/* Paper form replica */}
          <div className="border-2 border-sky-700 rounded-sm p-4">
            <div className="flex items-center gap-4 justify-center flex-wrap">
              <div className="w-16 h-16 rounded-full border-2 border-sky-700 flex flex-col items-center justify-center shrink-0 text-sky-700">
                <span className="text-[7px] font-bold leading-none">THE REHOBOTH</span>
                <span className="text-sm font-black leading-none my-0.5">TRCM</span>
                <span className="text-[6px] font-bold leading-none">CLINIC & MATERNITY</span>
              </div>
              <div className="text-center">
                <h1 className="text-xl sm:text-2xl font-black text-sky-700 uppercase tracking-tight">The Rehoboth Clinic &amp; Maternity</h1>
                <p className="text-[11px] text-sky-700 font-semibold">
                  P.O. Box 89, Adogbe Living Faith Church Odole Mopa Mopamuro L.G.A., Kogi State
                </p>
                <p className="text-sm font-bold text-sky-700 mt-1">08054894848</p>
              </div>
            </div>
            <div className="mt-3 bg-sky-700 text-white text-center font-black tracking-wide py-1 uppercase text-sm">
              Laboratory Result Form
            </div>

            {members.length > 0 && (
              <div className="mt-4 flex items-end gap-2">
                <label className="text-sm font-semibold text-slate-700 whitespace-nowrap pb-1">Result is for:</label>
                <select
                  value={form.familyMemberId}
                  onChange={e => pickMember(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent border-b border-slate-400 px-1 py-1 text-sm text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="">{patient.name} (card holder)</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_90px] gap-3">
                <Line label="Patient Name" value={form.patientName} onChange={v => set({ patientName: v })} />
                <div className="flex items-end gap-2">
                  <label className="text-sm font-semibold text-slate-700 pb-1">Sex:</label>
                  <select
                    value={form.sex}
                    onChange={e => set({ sex: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent border-b border-slate-400 px-1 py-1 text-sm text-slate-900 outline-none focus:border-blue-600"
                  >
                    <option value=""></option><option>Male</option><option>Female</option>
                  </select>
                </div>
                <Line label="Age" value={form.age} onChange={v => set({ age: v })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_100px] gap-3">
                <Line label="Hospital/Clinic" value={form.hospitalClinic} onChange={v => set({ hospitalClinic: v })} />
                <Line label="Ward" value={form.ward} onChange={v => set({ ward: v })} list="lrf-wards" />
                <Line label="No" value={form.no} onChange={v => set({ no: v })} />
              </div>
              <Line label="Clinical History" value={form.clinicalHistory} onChange={v => set({ clinicalHistory: v })} multiline voice />
              <Line label="Consultant" value={form.consultant} onChange={v => set({ consultant: v })} list="lrf-consultants" />
              <Line label="Provisional Diagnosis" value={form.provisionalDiagnosis} onChange={v => set({ provisionalDiagnosis: v })} multiline voice />
              <Line label="Nature of Specimen" value={form.natureOfSpecimen} onChange={v => set({ natureOfSpecimen: v })} list="lrf-specimens" />
              <Line label="Test Required" value={form.testsRequired} onChange={v => set({ testsRequired: v })} multiline voice />
            </div>

            <div className="mt-6 text-center font-black text-sky-700 uppercase tracking-wide text-sm">For Lab Use Only</div>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
                <Line label="Date of Reception" type="date" value={form.dateOfReception} onChange={v => set({ dateOfReception: v })} />
                <Line label="Lab No" value={form.labNo} onChange={v => set({ labNo: v })} />
              </div>
              <Line label="Lab Result" value={form.labResult} onChange={v => set({ labResult: v })} multiline voice />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <Line label="Date" type="date" value={form.resultDate} onChange={v => set({ resultDate: v })} />
                <Line label="Lab. Secretary" value={form.labSecretary} onChange={v => set({ labSecretary: v })} />
              </div>
            </div>

            <datalist id="lrf-wards">{wards.map(w => <option key={w} value={w} />)}</datalist>
            <datalist id="lrf-consultants">{consultants.map(c => <option key={c} value={c} />)}</datalist>
            <datalist id="lrf-specimens">{specimenSuggestions.map(sp => <option key={sp} value={sp} />)}</datalist>
          </div>

          <p className="text-[11px] text-slate-400 mt-3 text-center">
            This form is a record of results only. It does not create or bill any lab test.
          </p>
        </div>
      )}
    </FullScreenSheet>
  );
};


interface RecentForm { id: string; patientId: string; patientName?: string; testsRequired?: string; createdAt: string }

export const LabResultFormSheet: React.FC<Props> = ({ userId, onClose }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [initialFormId, setInitialFormId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Patient[]>([]);
  const [recent, setRecent] = useState<RecentForm[]>([]);
  const [opening, setOpening] = useState(false);

  const loadRecent = async () => {
    const { data, error } = await supabase
      .from('lab_request_forms')
      .select('id, patient_id, patient_name, tests_required, created_at')
      .order('updated_at', { ascending: false })
      .limit(15);
    if (error) { console.error('[lab_request_forms:recent]', error.message); return; }
    setRecent((data || []).map((r: any) => ({
      id: r.id, patientId: r.patient_id, patientName: r.patient_name,
      testsRequired: r.tests_required, createdAt: r.created_at,
    })));
  };
  useEffect(() => { if (!patient) loadRecent(); }, [patient]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const safe = q.replace(/[%,()]/g, ' ');
      const { data, error } = await supabase
        .from('patients').select('*')
        .or(`name.ilike.%${safe}%,card_id.ilike.%${safe}%`)
        .limit(8);
      if (error) { console.error('[patients:search]', error.message); return; }
      setSuggestions((data || []).map(patientFromRow));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const openRecent = async (r: RecentForm) => {
    setOpening(true);
    const { data, error } = await supabase.from('patients').select('*').eq('card_id', r.patientId).maybeSingle();
    setOpening(false);
    if (error || !data) { toast.error('Could not open that patient.'); return; }
    setInitialFormId(r.id);
    setPatient(patientFromRow(data));
  };

  if (patient) {
    return (
      <ResultFormEditor
        key={patient.cardId + (initialFormId || '')}
        patient={patient}
        userId={userId}
        initialFormId={initialFormId}
        onChangePatient={() => { setPatient(null); setInitialFormId(undefined); setQuery(''); setSuggestions([]); }}
        onClose={onClose}
      />
    );
  }

  return (
    <FullScreenSheet title="Lab Results" subtitle="Choose a patient to record results" onClose={onClose}>
      <div className="max-w-[700px] mx-auto p-4 pb-24 space-y-6">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Find patient</label>
          <div className="relative mt-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type a name or card number…"
              className="w-full pl-9 pr-3 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {query.trim().length >= 2 && suggestions.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">No matching patient.</p>
          )}
          {suggestions.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {suggestions.map(p => (
                <button
                  key={p.cardId}
                  onClick={() => { setInitialFormId(undefined); setPatient(p); }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center justify-between"
                >
                  <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                  <span className="text-xs text-slate-400">Card {p.cardId}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Recently saved</p>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400">No saved lab result forms yet.</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {recent.map(r => (
                <button
                  key={r.id}
                  disabled={opening}
                  onClick={() => openRecent(r)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between gap-3 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-800 text-sm truncate">{r.patientName || `Card ${r.patientId}`}</span>
                    <span className="block text-xs text-slate-400 truncate">{r.testsRequired || 'No test listed'}</span>
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{format(new Date(r.createdAt), 'MMM d, HH:mm')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </FullScreenSheet>
  );
};
