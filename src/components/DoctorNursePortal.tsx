import React, { useState, useEffect, useMemo, memo } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { Patient, MedicalRecord, UserRole, Visit, LabTest } from '../types';
import { toast } from 'sonner';
import { Search, Activity, ClipboardList, FlaskConical, Pill, Plus, Save, History, User, Heart, Thermometer, Droplets, Stethoscope, FileText, CreditCard, LayoutDashboard, Users as UsersIcon, ChevronDown, ChevronUp, Wind, X, AlertTriangle, FolderOpen, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { NAFDAC_DRUGS, LAB_TESTS } from '../data/hospitalData';
import { logAction, logRecordAccess } from '../lib/audit';
import { useFormDraft } from '../hooks/useFormDraft';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender, dob: r.dob,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});
const recordFromRow = (r: any): MedicalRecord => ({
id: r.id, patientId: r.patient_id, staffId: r.staff_id,
vitals: {
bloodPressure: r.blood_pressure, temperature: r.temperature, sugarLevel: r.sugar_level,
pulse: r.pulse, respiratoryRate: r.respiratory_rate, spo2: r.spo2, weight: r.weight,
},
diagnosis: r.diagnosis, prescriptions: r.prescriptions || [], recommendedTests: r.recommended_tests || [],
admissionRecommended: r.admission_recommended, cSectionRecommended: r.c_section_recommended,
paymentFee: r.payment_fee, paymentStatus: r.payment_status,
dispensed: r.dispensed, createdAt: r.created_at,
});
const visitFromRow = (r: any): Visit => ({
id: r.id, patientId: r.patient_id, timestamp: r.timestamp, diagnosis: r.diagnosis,
labResults: r.lab_results, structuredLabNote: r.structured_lab_note, prescription: r.prescription,
prescriptionNote: r.prescription_note, billingAmount: r.billing_amount,
paymentStatus: r.payment_status, staffId: r.staff_id,
});
const labTestFromRow = (r: any): LabTest => ({
id: r.id, patientId: r.patient_id, recordId: r.record_id, testType: r.test_type,
price: r.price, result: r.result, structuredResults: r.structured_results,
paymentStatus: r.payment_status, createdAt: r.created_at,
});
import { motion, AnimatePresence } from 'motion/react';
import { PatientHistory } from './PatientHistory';
interface Props {
role: UserRole;
userId: string;
}
export const DoctorNursePortal: React.FC<Props> = ({ role, userId }) => {
const [searchId, setSearchId] = useState('');
const [patient, setPatient] = useState<Patient | null>(null);
const [records, setRecords] = useState<MedicalRecord[]>([]);
const [loading, setLoading] = useState(false);
const [view, setView] = useState<'dashboard' | 'assessment' | 'consultations' | 'labResults'>('dashboard');
const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
const [stats, setStats] = useState({
totalPatients: 0,
todayRecords: 0
});
const [visits, setVisits] = useState<Visit[]>([]);
const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
const [isNewConsultation, setIsNewConsultation] = useState(false);
const [showImageUpload, setShowImageUpload] = useState(false);
const [showGlobalConsultation, setShowGlobalConsultation] = useState(false);
const [globalConsultationSearch, setGlobalConsultationSearch] = useState('');
const { data: consultationForm, setData: setConsultationForm, clearDraft: clearConsultationDraft } = useFormDraft('consultation_form', {
diagnosis: '',
labResults: '',
structuredLabNote: '',
prescription: '',
prescriptionNote: '',
billingAmount: '',
imageUrl: ''
});
const initialFormData = {
bloodPressure: '',
temperature: '',
sugarLevel: '',
pulse: '',
respiratoryRate: '',
spo2: '',
weight: '',
diagnosis: '',
prescription: '',
recommendedTests: [] as { name: string, price: string }[],
admissionRecommended: false,
cSectionRecommended: false,
paymentFee: ''
};
const { data: formData, setData: setFormData, clearDraft: clearFormDraft } = useFormDraft('medical_assessment', initialFormData);
const [drugSearch, setDrugSearch] = useState('');
const [testSearch, setTestSearch] = useState('');
const [showHistory, setShowHistory] = useState(false);
const [globalLabTests, setGlobalLabTests] = useState<(LabTest & { patient?: Patient })[]>([]);
const filteredDrugs = useMemo(() => 
NAFDAC_DRUGS.filter(d => d.toLowerCase().includes(drugSearch.toLowerCase())).slice(0, 5),
[drugSearch]
);
const filteredTests = useMemo(() => 
LAB_TESTS.filter(t => t.toLowerCase().includes(testSearch.toLowerCase())).slice(0, 5),
[testSearch]
);
const addDrug = (drug: string) => {
const current = formData.prescription ? formData.prescription.split(',').map(s => s.trim()) : [];
if (!current.includes(drug)) {
setFormData({ ...formData, prescription: [...current, drug].join(', ') });
}
setDrugSearch('');
};
const addTest = (test: string) => {
if (!formData.recommendedTests.some(t => t.name === test)) {
setFormData({ ...formData, recommendedTests: [...formData.recommendedTests, { name: test, price: '' }] });
}
setTestSearch('');
};
useEffect(() => {
fetchStats();
fetchGlobalLabTests();
const channel = supabase
.channel('lab-tests-changes')
.on('postgres_changes', { event: '*', schema: 'public', table: 'lab_tests' }, () => {
fetchGlobalLabTests();
})
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchGlobalLabTests = async () => {
const { data, error } = await supabase
.from('lab_tests')
.select('*, patients(*)')
.order('created_at', { ascending: false });
if (error) return handleSupabaseError(error, 'select', 'lab_tests');
const testsWithPatients = (data || []).map((row: any) => ({
...labTestFromRow(row),
patient: row.patients ? patientFromRow(row.patients) : undefined,
}));
setGlobalLabTests(testsWithPatients);
};
const fetchStats = async () => {
const { count: totalPatients } = await supabase.from('patients').select('*', { count: 'exact', head: true });
const today = new Date().toISOString().split('T')[0];
const { count: todayRecords } = await supabase
.from('medical_records')
.select('*', { count: 'exact', head: true })
.gte('created_at', `${today}T00:00:00`)
.lt('created_at', `${today}T23:59:59.999`);
setStats({ totalPatients: totalPatients || 0, todayRecords: todayRecords || 0 });
};
const handleSearch = async (e: React.FormEvent) => {
e.preventDefault();
setLoading(true);
try {
const { data, error } = await supabase.from('patients').select('*').eq('card_id', searchId).maybeSingle();
if (error) throw error;
if (data) {
setPatient(patientFromRow(data));
setView('consultations');
setIsNewConsultation(true);
setSelectedVisit(null);
await logAction(userId, 'SEARCH_PATIENT', `Searched for patient with Card ID ${searchId}`);
await logRecordAccess(userId, searchId);
} else {
toast.error('Patient not found.');
setPatient(null);
setRecords([]);
setVisits([]);
}
} catch (error) {
handleSupabaseError(error, 'select', 'patients');
} finally {
setLoading(false);
}
};
useEffect(() => {
if (!patient) return;
const fetchRecordsAndVisits = async () => {
const { data: recordsData, error: recordsErr } = await supabase
.from('medical_records')
.select('*')
.eq('patient_id', patient.cardId)
.order('created_at', { ascending: false });
if (recordsErr) return handleSupabaseError(recordsErr, 'select', 'medical_records');
setRecords((recordsData || []).map(recordFromRow));
const { data: visitsData, error: visitsErr } = await supabase
.from('visits')
.select('*')
.eq('patient_id', patient.cardId)
.order('timestamp', { ascending: false });
if (visitsErr) return handleSupabaseError(visitsErr, 'select', 'visits');
setVisits((visitsData || []).map(visitFromRow));
};
fetchRecordsAndVisits();
const channel = supabase
.channel(`patient-${patient.cardId}-changes`)
.on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records', filter: `patient_id=eq.${patient.cardId}` }, fetchRecordsAndVisits)
.on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `patient_id=eq.${patient.cardId}` }, fetchRecordsAndVisits)
.subscribe();
return () => { supabase.removeChannel(channel); };
}, [patient]);
const handleConsultationSubmit = async (e: React.FormEvent) => {
e.preventDefault();
if (!patient) return;
if (!consultationForm.diagnosis.trim()) {
toast.error('Please provide a diagnosis.');
return;
}
setLoading(true);
try {
const billingAmount = parseFloat(consultationForm.billingAmount) || 0;
const { error } = await supabase.from('visits').insert({
patient_id: patient.cardId,
diagnosis: consultationForm.diagnosis,
lab_results: consultationForm.labResults,
structured_lab_note: consultationForm.structuredLabNote,
prescription: consultationForm.prescription,
prescription_note: consultationForm.prescriptionNote,
billing_amount: billingAmount,
payment_status: billingAmount > 0 ? 'pending' : 'paid',
staff_id: userId,
});
if (error) throw error;
await logAction(userId, 'CREATE_VISIT', `Created visit record for patient ${patient.cardId}`);
toast.success('Consultation saved successfully!');
clearConsultationDraft();
setShowImageUpload(false);
setIsNewConsultation(false);
} catch (error) {
handleSupabaseError(error, 'insert', 'visits');
} finally {
setLoading(false);
}
};
const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
if (!patient) return;
if (!formData.diagnosis.trim() && (formData.prescription || formData.recommendedTests)) {
toast.error('Please provide a diagnosis before adding prescriptions or tests.');
return;
}
if (!formData.bloodPressure || !formData.temperature) {
toast.error('Blood Pressure and Temperature are required vitals.');
return;
}
setLoading(true);
try {
const paymentFee = parseFloat(formData.paymentFee) || 0;
const { data: recordRow, error } = await supabase.from('medical_records').insert({
patient_id: patient.cardId,
staff_id: userId,
blood_pressure: formData.bloodPressure,
temperature: formData.temperature,
sugar_level: formData.sugarLevel,
pulse: formData.pulse,
respiratory_rate: formData.respiratoryRate,
spo2: formData.spo2,
weight: formData.weight,
diagnosis: formData.diagnosis,
prescriptions: formData.prescription.split(',').map(s => s.trim()).filter(s => s),
recommended_tests: formData.recommendedTests.map(t => t.name),
admission_recommended: formData.admissionRecommended,
c_section_recommended: formData.cSectionRecommended,
payment_fee: paymentFee,
payment_status: paymentFee > 0 ? 'pending' : 'paid',
}).select().single();
if (error) throw error;
await logAction(userId, 'CREATE_MEDICAL_RECORD', `Created medical record for patient ${patient.cardId}`);
if (formData.recommendedTests.length > 0) {
for (const test of formData.recommendedTests) {
const { error: labErr } = await supabase.from('lab_tests').insert({
patient_id: patient.cardId,
record_id: recordRow?.id,
test_type: test.name,
price: parseFloat(test.price) || 0,
payment_status: 'pending',
});
if (labErr) throw labErr;
await logAction(userId, 'RECOMMEND_LAB_TEST', `Recommended ${test.name} for patient ${patient.cardId}`);
}
}
toast.success('Medical record saved successfully!');
clearFormDraft();
fetchStats();
} catch (error) {
handleSupabaseError(error, 'insert', 'medical_records');
} finally {
setLoading(false);
}
};
return (
<div className="space-y-8 max-w-7xl mx-auto">
<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
<div>
<h2 className="text-3xl font-bold text-slate-900">{role} Portal</h2>
<p className="text-slate-500">Patient assessment and clinical records.</p>
</div>
<div className="flex flex-wrap gap-2">
<button 
onClick={() => { setView('dashboard'); setPatient(null); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'dashboard' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<LayoutDashboard className="w-4 h-4" /> Dashboard
</button>
<button 
onClick={() => { setView('labResults'); setPatient(null); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'labResults' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<FlaskConical className="w-4 h-4" /> Lab Results
</button>
<button 
onClick={() => { setShowGlobalConsultation(true); }}
className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all bg-green-600 text-white hover:bg-green-700"
>
<Plus className="w-4 h-4" /> New Routine Check-up
</button>
<form onSubmit={handleSearch} className="flex gap-2">
<div className="relative">
<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
<input
value={searchId}
onChange={e => setSearchId(e.target.value)}
className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none w-48 sm:w-64"
placeholder="Enter Card ID"
/>
</div>
<button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all">
Search
</button>
</form>
</div>
</div>
{view === 'labResults' ? (
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
<FlaskConical className="w-5 h-5 text-purple-500" /> Global Lab Results
</h3>
<div className="overflow-x-auto">
<table className="w-full">
<thead>
<tr className="text-left text-xs font-bold text-slate-400 uppercase border-b border-slate-100">
<th className="pb-4 font-bold">Date</th>
<th className="pb-4 font-bold">Patient</th>
<th className="pb-4 font-bold">Test Type</th>
<th className="pb-4 font-bold">Status</th>
<th className="pb-4 font-bold">Payment</th>
<th className="pb-4 font-bold">Result</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{globalLabTests.map((test) => (
<tr key={test.id} className="hover:bg-slate-50 transition-colors">
<td className="py-4 text-sm text-slate-600">
{format(new Date(test.createdAt), 'MMM d, yyyy HH:mm')}
</td>
<td className="py-4">
<div className="flex items-center gap-3">
<div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
{test.patient?.name?.charAt(0) || test.patientId.charAt(0)}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{test.patient?.name || 'Unknown Patient'}</p>
<p className="text-xs text-slate-500">{test.patientId}</p>
</div>
</div>
</td>
<td className="py-4 text-sm font-medium text-slate-900">{test.testType}</td>
<td className="py-4">
<span className={cn(
"px-3 py-1 rounded-full text-xs font-bold",
test.result ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
)}>
{test.result ? 'Completed' : 'Pending'}
</span>
</td>
<td className="py-4">
<span className={cn(
"px-3 py-1 rounded-full text-xs font-bold uppercase",
test.paymentStatus === 'paid' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
)}>
{test.paymentStatus || 'pending'}
</span>
</td>
<td className="py-4 text-sm text-slate-600 max-w-xs truncate">
{test.result || '-'}
{test.imageUrl && (
<a href={test.imageUrl} target="_blank" rel="noreferrer" className="block mt-1 text-xs text-blue-600 hover:underline">
View Attached Image
</a>
)}
</td>
</tr>
))}
{globalLabTests.length === 0 && (
<tr>
<td colSpan={5} className="py-8 text-center text-slate-400">
No lab tests found.
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
) : view === 'dashboard' ? (
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
<div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
<UsersIcon className="w-6 h-6" />
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase">Total Patients</p>
<h4 className="text-2xl font-black text-slate-900">{stats.totalPatients}</h4>
</div>
</div>
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
<div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
<ClipboardList className="w-6 h-6" />
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase">Records Today</p>
<h4 className="text-2xl font-black text-slate-900">{stats.todayRecords}</h4>
</div>
</div>
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
<div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
<Activity className="w-6 h-6" />
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase">Clinical Status</p>
<h4 className="text-2xl font-black text-slate-900">Active</h4>
</div>
</div>
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
<div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
<Stethoscope className="w-6 h-6" />
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase">Staff Online</p>
<h4 className="text-2xl font-black text-slate-900">Ready</h4>
</div>
</div>
<div className="md:col-span-2 lg:col-span-4 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Clinical Activity
</h3>
<div className="space-y-4">
{records.slice(0, 10).map((record, idx) => (
<div key={idx} className="p-4 rounded-xl border border-slate-50 bg-slate-50/50 flex justify-between items-center">
<div className="flex items-center gap-4">
<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
{record.patientId.charAt(0)}
</div>
<div>
<p className="font-bold text-slate-900">Patient ID: {record.patientId}</p>
<p className="text-xs text-slate-500">{record.diagnosis || 'General Checkup'}</p>
</div>
</div>
<div className="text-right">
<p className="text-xs font-bold text-slate-400">{format(new Date(record.createdAt), 'MMM d, HH:mm')}</p>
</div>
</div>
))}
{records.length === 0 && (
<p className="text-center text-slate-400 py-10">No recent clinical records found.</p>
)}
</div>
</div>
</div>
) : patient ? (
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
{/* Patient Info Sidebar */}
<div className="lg:col-span-4 space-y-6">
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
<div className="flex flex-col items-center text-center mb-6">
<div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-2xl mb-4">
{patient.name.charAt(0)}
</div>
<h3 className="font-bold text-slate-900 text-lg">{patient.name}</h3>
<span className="text-xs font-bold bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase mt-2">
{patient.cardId}
</span>
</div>
<div className="grid grid-cols-2 gap-4 text-sm">
<div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Gender</p>
<p className="font-bold text-slate-700 capitalize">{patient.gender}</p>
</div>
<div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Age</p>
<p className="font-bold text-slate-700">{patient.age} years</p>
</div>
<div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Category</p>
<p className="font-bold text-slate-700 capitalize">{patient.category}</p>
</div>
<div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Phone</p>
<p className="font-bold text-slate-700">{patient.phone}</p>
</div>
</div>
<div className="flex flex-col gap-2 mt-6">
<button
onClick={() => setView('consultations')}
className={cn(
"w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all border",
view === 'consultations' ? "bg-purple-600 text-white border-purple-600" : "bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-100"
)}
>
<FolderOpen className="w-4 h-4" /> Consultations & Visits
</button>
<button
onClick={() => setView('assessment')}
className={cn(
"w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all border",
view === 'assessment' ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100"
)}
>
<Stethoscope className="w-4 h-4" /> Standard Assessment
</button>
<button
onClick={() => setShowHistory(true)}
className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all border border-slate-200"
>
<History className="w-4 h-4" /> View Full History
</button>
</div>
<div className="mt-6 pt-6 border-t border-slate-100 space-y-2">
<p className="text-xs font-bold text-slate-400 uppercase">Address</p>
<p className="text-sm text-slate-600">{patient.address}</p>
</div>
<div className="mt-6 pt-6 border-t border-slate-100">
<p className="text-xs font-bold text-slate-400 uppercase mb-2">Billing Summary</p>
<div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex justify-between items-center">
<span className="font-bold text-orange-700">Total Billed (Visits)</span>
<span className="font-black text-orange-700 text-lg">₦{visits.reduce((sum, v) => sum + (v.billingAmount || 0), 0).toLocaleString()}</span>
</div>
</div>
</div>
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
<h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
<History className="w-4 h-4 text-slate-400" /> Medical History
</h4>
<div className="space-y-4">
{records.map((record, idx) => (
<div key={idx} className="border border-slate-100 rounded-xl overflow-hidden">
<button 
onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
className="w-full p-4 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between"
>
<div className="text-left">
<p className="text-xs font-bold text-slate-900">
{format(new Date(record.createdAt), 'MMM d, yyyy')}
</p>
<p className="text-[10px] text-slate-500">{record.diagnosis || 'No diagnosis'}</p>
</div>
{expandedRecord === record.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
</button>
<AnimatePresence>
{expandedRecord === record.id && (
<motion.div
initial={{ height: 0 }}
animate={{ height: 'auto' }}
exit={{ height: 0 }}
className="overflow-hidden bg-white"
>
<div className="p-4 space-y-4 text-xs">
<div className="grid grid-cols-3 gap-2">
<div className="p-2 bg-blue-50 rounded-lg">
<p className="text-[8px] font-bold text-blue-400 uppercase">BP</p>
<p className="font-bold text-blue-700">{record.vitals?.bloodPressure || '-'}</p>
</div>
<div className="p-2 bg-red-50 rounded-lg">
<p className="text-[8px] font-bold text-red-400 uppercase">Temp</p>
<p className="font-bold text-red-700">{record.vitals?.temperature || '-'}</p>
</div>
<div className="p-2 bg-green-50 rounded-lg">
<p className="text-[8px] font-bold text-green-400 uppercase">Sugar</p>
<p className="font-bold text-green-700">{record.vitals?.sugarLevel || '-'}</p>
</div>
</div>
{record.prescriptions && record.prescriptions.length > 0 && (
<div>
<p className="font-bold text-slate-400 uppercase mb-1">Prescriptions</p>
<div className="flex flex-wrap gap-1">
{record.prescriptions.map((p, i) => (
<span key={i} className="px-2 py-0.5 bg-slate-100 rounded-md">{p}</span>
))}
</div>
</div>
)}
{record.paymentFee && record.paymentFee > 0 && (
<div className="flex justify-between items-center bg-orange-50 p-2 rounded-lg">
<span className="font-bold text-orange-700">Payment Fee</span>
<div className="flex items-center gap-2">
{record.paymentStatus && (
<span className={cn(
"px-2 py-0.5 text-[10px] font-bold rounded-full uppercase",
record.paymentStatus === 'paid' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
)}>
{record.paymentStatus}
</span>
)}
<span className="font-black text-orange-700">₦{record.paymentFee.toLocaleString()}</span>
</div>
</div>
)}
</div>
</motion.div>
)}
</AnimatePresence>
</div>
))}
{records.length === 0 && (
<p className="text-center text-slate-400 text-sm py-8">No previous records</p>
)}
</div>
</div>
</div>
{/* Main Assessment Form */}
<div className="lg:col-span-8 space-y-8">
{view === 'consultations' ? (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex h-[800px] overflow-hidden">
{/* Visits Sidebar */}
<div className="w-1/3 border-r border-slate-100 bg-slate-50/50 flex flex-col">
<div className="p-4 border-b border-slate-100">
<button 
onClick={() => {
setIsNewConsultation(true);
setSelectedVisit(null);
setConsultationForm({ diagnosis: '', labResults: '', prescription: '', billingAmount: '' });
}}
className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-sm"
>
<Plus className="w-4 h-4" /> Start New Consultation
</button>
</div>
<div className="flex-1 overflow-y-auto p-4 space-y-2">
{visits.map(visit => (
<button
key={visit.id}
onClick={() => {
setIsNewConsultation(false);
setSelectedVisit(visit);
}}
className={cn(
"w-full text-left p-4 rounded-xl border transition-all",
selectedVisit?.id === visit.id && !isNewConsultation
? "bg-white border-blue-200 shadow-sm ring-1 ring-blue-500"
: "bg-white border-slate-100 hover:border-blue-200"
)}
>
<p className="font-bold text-slate-900 text-sm">{format(new Date(visit.timestamp), 'MMM d, yyyy - HH:mm')}</p>
<p className="text-xs text-slate-500 truncate mt-1">{visit.diagnosis || 'No diagnosis'}</p>
</button>
))}
{visits.length === 0 && (
<div className="text-center py-8 text-slate-400 text-sm">
No previous visits found.
</div>
)}
</div>
</div>
{/* Main Form/View */}
<div className="w-2/3 flex flex-col bg-white">
{isNewConsultation ? (
<form onSubmit={handleConsultationSubmit} className="flex-1 flex flex-col h-full">
<div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
<div className="flex items-center gap-2">
<FileText className="w-5 h-5 text-blue-600" />
<h3 className="font-bold text-slate-900">New Consultation</h3>
</div>
<span className="text-xs font-bold text-slate-400">{format(new Date(), 'MMM d, yyyy')}</span>
</div>
<div className="flex-1 overflow-y-auto p-6 space-y-6">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Diagnosis</label>
<textarea
value={consultationForm.diagnosis}
onChange={e => setConsultationForm({ ...consultationForm, diagnosis: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[120px]"
placeholder="Enter diagnosis details..."
required
/>
</div>
<div className="space-y-2 relative">
<label className="text-sm font-bold text-slate-700">Prescription (Drugs)</label>
<input
type="text"
value={consultationForm.prescription}
onChange={e => setConsultationForm({ ...consultationForm, prescription: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="Type to search drugs (comma separated)..."
list="drugs-list"
/>
<datalist id="drugs-list">
{NAFDAC_DRUGS.map((drug, i) => <option key={i} value={drug} />)}
</datalist>
<p className="text-xs text-slate-500">Separate multiple drugs with commas.</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Prescription Note</label>
<textarea
value={consultationForm.prescriptionNote}
onChange={e => setConsultationForm({ ...consultationForm, prescriptionNote: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
placeholder="Enter prescription notes..."
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Structured Lab Note</label>
<textarea
value={consultationForm.structuredLabNote}
onChange={e => setConsultationForm({ ...consultationForm, structuredLabNote: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
placeholder="Enter structured lab notes..."
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Lab Results</label>
<textarea
value={consultationForm.labResults}
onChange={e => setConsultationForm({ ...consultationForm, labResults: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
placeholder="Enter lab results..."
/>
</div>
<div className="space-y-4 border-t border-slate-100 pt-4">
<div className="flex items-center justify-between">
<label className="text-sm font-bold text-slate-700 flex items-center gap-2">
<Camera className="w-4 h-4" /> Attach Image (Optional)
</label>
<button
type="button"
onClick={() => setShowImageUpload(!showImageUpload)}
className="text-xs font-bold text-blue-600 hover:text-blue-800"
>
{showImageUpload ? 'Cancel Upload' : 'Add Image (X-Ray/Lab)'}
</button>
</div>
{showImageUpload && (
<div className="flex items-center justify-center w-full">
<label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
<div className="flex flex-col items-center justify-center pt-5 pb-6">
<Camera className="w-8 h-8 text-slate-400 mb-2" />
<p className="text-sm text-slate-500 font-bold">Click to upload image</p>
</div>
<input 
type="file" 
className="hidden" 
accept="image/*"
onChange={(e) => {
const file = e.target.files?.[0];
if (file) {
if (file.size > 1000000) {
toast.error('Image too large (max 1MB)');
return;
}
const reader = new FileReader();
reader.onloadend = () => {
setConsultationForm({ ...consultationForm, imageUrl: reader.result as string });
};
reader.readAsDataURL(file);
}
}}
/>
</label>
</div>
)}
{consultationForm.imageUrl && (
<div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200">
<img src={consultationForm.imageUrl} alt="Attachment" className="w-full h-full object-cover" />
<button
type="button"
onClick={() => setConsultationForm({ ...consultationForm, imageUrl: '' })}
className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
>
<X className="w-4 h-4" />
</button>
</div>
)}
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Billing Amount</label>
<input
type="number"
value={consultationForm.billingAmount}
onChange={e => setConsultationForm({ ...consultationForm, billingAmount: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
placeholder="₦ 0.00"
/>
</div>
</div>
<div className="p-6 border-t border-slate-100 bg-slate-50/50">
<button
type="submit"
disabled={loading}
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
>
<Save className="w-5 h-5" />
{loading ? 'Saving...' : 'Save Consultation'}
</button>
</div>
</form>
) : selectedVisit ? (
<div className="flex-1 flex flex-col h-full">
<div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
<div className="flex items-center gap-2">
<FolderOpen className="w-5 h-5 text-purple-600" />
<h3 className="font-bold text-slate-900">Historical Folder</h3>
</div>
<span className="text-xs font-bold text-slate-400">{format(new Date(selectedVisit.timestamp), 'MMM d, yyyy - HH:mm')}</span>
</div>
<div className="flex-1 overflow-y-auto p-6 space-y-6">
<div className="space-y-2">
<label className="text-xs font-bold text-slate-400 uppercase">Diagnosis</label>
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
{selectedVisit.diagnosis || 'N/A'}
</div>
</div>
{selectedVisit.prescriptionNote && (
<div className="space-y-2">
<label className="text-xs font-bold text-slate-400 uppercase">Prescription Note</label>
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
{selectedVisit.prescriptionNote}
</div>
</div>
)}
{selectedVisit.structuredLabNote && (
<div className="space-y-2">
<label className="text-xs font-bold text-slate-400 uppercase">Structured Lab Note</label>
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
{selectedVisit.structuredLabNote}
</div>
</div>
)}
<div className="space-y-2">
<label className="text-xs font-bold text-slate-400 uppercase">Lab Results</label>
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
{selectedVisit.labResults || 'N/A'}
</div>
</div>
<div className="space-y-2">
<label className="text-xs font-bold text-slate-400 uppercase">Prescription</label>
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
{selectedVisit.prescription || 'N/A'}
</div>
</div>
<div className="space-y-2">
<label className="text-xs font-bold text-slate-400 uppercase">Billing Amount</label>
<div className="p-4 bg-orange-50 rounded-xl border border-orange-100 text-orange-700 font-bold text-lg">
₦{(selectedVisit.billingAmount || 0).toLocaleString()}
</div>
</div>
{selectedVisit.imageUrl && (
<div className="space-y-2">
<label className="text-xs font-bold text-slate-400 uppercase">Attached Image</label>
<div className="relative w-full rounded-xl overflow-hidden border border-slate-200">
<img src={selectedVisit.imageUrl} alt="Attachment" className="w-full h-auto object-contain max-h-96" />
</div>
</div>
)}
</div>
</div>
) : (
<div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
<FolderOpen className="w-16 h-16 text-slate-200 mb-4" />
<p className="font-bold text-slate-600 text-lg mb-2">Consultation Workspace</p>
<p className="text-sm max-w-xs">Select a past visit from the sidebar to view its details, or start a new consultation.</p>
</div>
)}
</div>
</div>
) : (
<form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<div className="flex items-center gap-2">
<Stethoscope className="w-5 h-5 text-blue-600" />
<h3 className="font-bold text-slate-900">Clinical Assessment</h3>
</div>
<span className="text-xs font-medium text-slate-400">
Recording as: <span className="text-blue-600 font-bold">{role}</span>
</span>
</div>
<div className="p-8 space-y-8">
{/* Vitals Section - Tabular Grid Format */}
<div className="space-y-4">
<h4 className="font-bold text-slate-900 flex items-center gap-2">
<Activity className="w-4 h-4 text-red-500" /> Vital Signs Recording Chart
</h4>
<div className="overflow-hidden border border-slate-200 rounded-xl">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
<th className="px-4 py-3">Vital Sign</th>
<th className="px-4 py-3">Value / Observation</th>
<th className="px-4 py-3">Unit</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-100">
<tr>
<td className="px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2">
<Heart className="w-3 h-3 text-red-500" /> Blood Pressure
</td>
<td className="px-4 py-2">
<input
value={formData.bloodPressure}
onChange={e => setFormData({ ...formData, bloodPressure: e.target.value })}
className="w-full p-2 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded outline-none text-sm"
placeholder="e.g. 120/80"
/>
</td>
<td className="px-4 py-3 text-xs text-slate-400 font-mono">mmHg</td>
</tr>
<tr>
<td className="px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2">
<Thermometer className="w-3 h-3 text-orange-500" /> Temperature
</td>
<td className="px-4 py-2">
<input
value={formData.temperature}
onChange={e => setFormData({ ...formData, temperature: e.target.value })}
className="w-full p-2 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded outline-none text-sm"
placeholder="e.g. 36.5"
/>
</td>
<td className="px-4 py-3 text-xs text-slate-400 font-mono">°C</td>
</tr>
<tr>
<td className="px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2">
<Droplets className="w-3 h-3 text-blue-500" /> Sugar Level
</td>
<td className="px-4 py-2">
<input
value={formData.sugarLevel}
onChange={e => setFormData({ ...formData, sugarLevel: e.target.value })}
className="w-full p-2 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded outline-none text-sm"
placeholder="e.g. 95"
/>
</td>
<td className="px-4 py-3 text-xs text-slate-400 font-mono">mg/dL</td>
</tr>
<tr>
<td className="px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2">
<Activity className="w-3 h-3 text-green-500" /> Pulse Rate
</td>
<td className="px-4 py-2">
<input
value={formData.pulse}
onChange={e => setFormData({ ...formData, pulse: e.target.value })}
className="w-full p-2 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded outline-none text-sm"
placeholder="e.g. 72"
/>
</td>
<td className="px-4 py-3 text-xs text-slate-400 font-mono">bpm</td>
</tr>
<tr>
<td className="px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2">
<Wind className="w-3 h-3 text-slate-500" /> Resp. Rate
</td>
<td className="px-4 py-2">
<input
value={formData.respiratoryRate}
onChange={e => setFormData({ ...formData, respiratoryRate: e.target.value })}
className="w-full p-2 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded outline-none text-sm"
placeholder="e.g. 16"
/>
</td>
<td className="px-4 py-3 text-xs text-slate-400 font-mono">breaths/min</td>
</tr>
<tr>
<td className="px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2">
<Droplets className="w-3 h-3 text-cyan-500" /> SpO2
</td>
<td className="px-4 py-2">
<input
value={formData.spo2}
onChange={e => setFormData({ ...formData, spo2: e.target.value })}
className="w-full p-2 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded outline-none text-sm"
placeholder="e.g. 98"
/>
</td>
<td className="px-4 py-3 text-xs text-slate-400 font-mono">%</td>
</tr>
<tr>
<td className="px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2">
<User className="w-3 h-3 text-indigo-500" /> Weight
</td>
<td className="px-4 py-2">
<input
value={formData.weight}
onChange={e => setFormData({ ...formData, weight: e.target.value })}
className="w-full p-2 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded outline-none text-sm"
placeholder="e.g. 70"
/>
</td>
<td className="px-4 py-3 text-xs text-slate-400 font-mono">kg</td>
</tr>
</tbody>
</table>
</div>
</div>
{/* Diagnosis & Treatment */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
<div className="space-y-4">
<h4 className="font-bold text-slate-900 flex items-center gap-2">
<FileText className="w-4 h-4 text-blue-500" /> Diagnosis
</h4>
<textarea
value={formData.diagnosis}
onChange={e => setFormData({ ...formData, diagnosis: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[150px]"
placeholder="Enter patient diagnosis..."
/>
</div>
<div className="space-y-4">
<h4 className="font-bold text-slate-900 flex items-center gap-2">
<Pill className="w-4 h-4 text-green-500" /> Prescriptions
</h4>
<div className="space-y-2">
<div className="relative">
<input
value={drugSearch}
onChange={e => setDrugSearch(e.target.value)}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
placeholder="Search NAFDAC approved drugs..."
/>
{drugSearch && (
<div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
{filteredDrugs.map((drug, i) => (
<button
key={i}
type="button"
onClick={() => addDrug(drug)}
className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors font-medium"
>
{drug}
</button>
))}
</div>
)}
</div>
<textarea
value={formData.prescription}
onChange={e => setFormData({ ...formData, prescription: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
placeholder="Selected medications will appear here..."
/>
</div>
</div>
</div>
{/* Recommendations */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
<div className="space-y-4">
<h4 className="font-bold text-slate-900 flex items-center gap-2">
<FlaskConical className="w-4 h-4 text-purple-500" /> Lab/Scan Recommendations
</h4>
<div className="space-y-2">
<div className="relative">
<input
value={testSearch}
onChange={e => setTestSearch(e.target.value)}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
placeholder="Search approved tests & scans..."
/>
{testSearch && (
<div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
{filteredTests.map((test, i) => (
<button
key={i}
type="button"
onClick={() => addTest(test)}
className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors font-medium"
>
{test}
</button>
))}
</div>
)}
</div>
<div className="space-y-2 mt-2">
{formData.recommendedTests.map((test, index) => (
<div key={index} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
<span className="flex-1 text-sm font-medium text-slate-700">{test.name}</span>
<div className="flex items-center gap-2">
<span className="text-sm font-bold text-slate-500">₦</span>
<input
type="number"
value={test.price}
onChange={e => {
const newTests = [...formData.recommendedTests];
newTests[index].price = e.target.value;
setFormData({ ...formData, recommendedTests: newTests });
}}
className="w-24 p-1 text-sm border border-slate-300 rounded outline-none focus:border-blue-500"
placeholder="Price"
required
/>
<button
type="button"
onClick={() => {
const newTests = formData.recommendedTests.filter((_, i) => i !== index);
setFormData({ ...formData, recommendedTests: newTests });
}}
className="p-1 text-red-500 hover:bg-red-50 rounded"
>
<X className="w-4 h-4" />
</button>
</div>
</div>
))}
</div>
</div>
</div>
<div className="space-y-4">
<h4 className="font-bold text-slate-900 flex items-center gap-2">
<CreditCard className="w-4 h-4 text-orange-500" /> Consultation/Treatment Fee
</h4>
<input
type="number"
value={formData.paymentFee}
onChange={e => setFormData({ ...formData, paymentFee: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
placeholder="₦ 0.00"
/>
</div>
</div>
{/* Toggles */}
<div className="flex flex-wrap gap-4 pt-4">
<label className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer group hover:bg-slate-100 transition-all w-full md:w-auto min-w-[240px]">
<div className="flex items-center gap-3">
<div className={cn(
"w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
formData.admissionRecommended ? "bg-blue-100 text-blue-600" : "bg-slate-200 text-slate-400"
)}>
<AlertTriangle className="w-5 h-5" />
</div>
<div>
<p className="text-sm font-bold text-slate-900">Recommend Admission</p>
<p className="text-[10px] text-slate-500 uppercase font-bold">Clinical Alert</p>
</div>
</div>
<div className="relative">
<input
type="checkbox"
checked={formData.admissionRecommended}
onChange={e => setFormData({ ...formData, admissionRecommended: e.target.checked })}
className="sr-only"
/>
<div className={cn("w-14 h-7 rounded-full transition-colors", formData.admissionRecommended ? "bg-blue-600" : "bg-slate-300")}></div>
<div className={cn("absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300", formData.admissionRecommended && "translate-x-7")}></div>
</div>
</label>
<label className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer group hover:bg-slate-100 transition-all w-full md:w-auto min-w-[240px]">
<div className="flex items-center gap-3">
<div className={cn(
"w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
formData.cSectionRecommended ? "bg-red-100 text-red-600" : "bg-slate-200 text-slate-400"
)}>
<Activity className="w-5 h-5" />
</div>
<div>
<p className="text-sm font-bold text-slate-900">Recommend C-SECTION</p>
<p className="text-[10px] text-slate-500 uppercase font-bold">Surgical Alert</p>
</div>
</div>
<div className="relative">
<input
type="checkbox"
checked={formData.cSectionRecommended}
onChange={e => setFormData({ ...formData, cSectionRecommended: e.target.checked })}
className="sr-only"
/>
<div className={cn("w-14 h-7 rounded-full transition-colors", formData.cSectionRecommended ? "bg-red-600" : "bg-slate-300")}></div>
<div className={cn("absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300", formData.cSectionRecommended && "translate-x-7")}></div>
</div>
</label>
</div>
<button
type="submit"
disabled={loading}
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
>
<Save className="w-5 h-5" />
{loading ? 'Saving Record...' : 'Save Clinical Record'}
</button>
</div>
</form>
)}
</div>
</div>
) : (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-20 text-center">
<div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
<Search className="w-10 h-10 text-slate-300" />
</div>
<h3 className="text-xl font-bold text-slate-900 mb-2">No Patient Selected</h3>
<p className="text-slate-500 max-w-md mx-auto">
Search for a patient using their Card ID to view their profile and start a clinical assessment.
</p>
</div>
)}
{/* Patient History Modal */}
<AnimatePresence>
{showHistory && patient && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
<div className="w-full max-w-5xl my-8">
<PatientHistory 
patientId={patient.cardId} 
onClose={() => setShowHistory(false)} 
/>
</div>
</div>
)}
</AnimatePresence>
{/* Global Routine Check-up Modal */}
<AnimatePresence>
{showGlobalConsultation && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden"
>
<div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<Plus className="w-5 h-5 text-green-600" /> Start Routine Check-up
</h3>
<button onClick={() => setShowGlobalConsultation(false)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
<X className="w-5 h-5 text-slate-500" />
</button>
</div>
<div className="p-6">
<form onSubmit={(e) => {
e.preventDefault();
if (!globalConsultationSearch.trim()) return;
setSearchId(globalConsultationSearch);
setShowGlobalConsultation(false);
handleSearch(e);
setTimeout(() => {
setView('consultations');
setIsNewConsultation(true);
}, 1000);
}} className="space-y-4">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Patient Card ID</label>
<input
type="text"
value={globalConsultationSearch}
onChange={e => setGlobalConsultationSearch(e.target.value)}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-green-500 outline-none"
placeholder="Enter patient Card ID..."
required
/>
</div>
<button
type="submit"
className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-all shadow-lg shadow-green-200"
>
Find Patient & Start
</button>
</form>
</div>
</motion.div>
</div>
)}
</AnimatePresence>
</div>
);
};
