import React, { useState, useEffect } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { Patient, MedicalRecord, LabTest, FinancialRecord, Visit } from '../types';
import { format } from 'date-fns';
import { ClipboardList, FlaskConical, Receipt, Clock, User, Phone, MapPin, Calendar, Heart, Activity, ChevronRight, Search, X, FolderOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { logRecordAccess } from '../lib/audit';
import { useAuth } from '../lib/auth';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender, dob: r.dob,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at,
});
const visitFromRow = (r: any): Visit => ({
id: r.id, patientId: r.patient_id, timestamp: r.timestamp, diagnosis: r.diagnosis,
labResults: r.lab_results, structuredLabNote: r.structured_lab_note, prescription: r.prescription,
prescriptionNote: r.prescription_note, billingAmount: r.billing_amount,
paymentStatus: r.payment_status, staffId: r.staff_id,
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
const labTestFromRow = (r: any): LabTest => ({
id: r.id, patientId: r.patient_id, recordId: r.record_id, testType: r.test_type,
price: r.price, result: r.result, structuredResults: r.structured_results,
imageUrl: r.image_url, paymentStatus: r.payment_status, createdAt: r.created_at,
});
const financialFromRow = (r: any): FinancialRecord => ({
id: r.id, patientId: r.patient_id, totalAmount: r.total_amount, paidAmount: r.paid_amount,
pendingAmount: r.pending_amount, paymentStatus: r.payment_status, paymentMethod: r.payment_method,
reconciled: r.reconciled, reconciledAt: r.reconciled_at, reconciledBy: r.reconciled_by,
createdAt: r.created_at,
});
interface Props {
patientId: string;
onClose?: () => void;
}
export const PatientHistory: React.FC<Props> = ({ patientId, onClose }) => {
const { user } = useAuth();
const [patient, setPatient] = useState<Patient | null>(null);
const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
const [labTests, setLabTests] = useState<LabTest[]>([]);
const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
const [visits, setVisits] = useState<Visit[]>([]);
const [loading, setLoading] = useState(true);
const [activeTab, setActiveTab] = useState<'visits' | 'medical' | 'labs' | 'financial'>('visits');
useEffect(() => {
if (!patientId) return;
setLoading(true);
// This is a full patient chart view — logging the access closes a
// gap the original app had (only writes were audited, not reads).
logRecordAccess(user?.id, patientId);
const fetchAll = async () => {
const [patientRes, visitsRes, medicalRes, labsRes, financialRes] = await Promise.all([
supabase.from('patients').select('*').eq('card_id', patientId).maybeSingle(),
supabase.from('visits').select('*').eq('patient_id', patientId).order('timestamp', { ascending: false }),
supabase.from('medical_records').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
supabase.from('lab_tests').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
supabase.from('financials').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
]);
if (patientRes.error) handleSupabaseError(patientRes.error, 'select', 'patients');
else if (patientRes.data) setPatient(patientFromRow(patientRes.data));
if (visitsRes.error) handleSupabaseError(visitsRes.error, 'select', 'visits');
else setVisits((visitsRes.data || []).map(visitFromRow));
if (medicalRes.error) handleSupabaseError(medicalRes.error, 'select', 'medical_records');
else setMedicalRecords((medicalRes.data || []).map(recordFromRow));
if (labsRes.error) handleSupabaseError(labsRes.error, 'select', 'lab_tests');
else setLabTests((labsRes.data || []).map(labTestFromRow));
if (financialRes.error) handleSupabaseError(financialRes.error, 'select', 'financials');
else setFinancialRecords((financialRes.data || []).map(financialFromRow));
setLoading(false);
};
fetchAll();
const channel = supabase
.channel(`patient-history-${patientId}`)
.on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `patient_id=eq.${patientId}` }, fetchAll)
.on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records', filter: `patient_id=eq.${patientId}` }, fetchAll)
.on('postgres_changes', { event: '*', schema: 'public', table: 'lab_tests', filter: `patient_id=eq.${patientId}` }, fetchAll)
.on('postgres_changes', { event: '*', schema: 'public', table: 'financials', filter: `patient_id=eq.${patientId}` }, fetchAll)
.subscribe();
return () => { supabase.removeChannel(channel); };
}, [patientId]);
if (loading) {
return (
<div className="flex items-center justify-center p-12">
<Activity className="w-8 h-8 text-blue-600 animate-pulse" />
</div>
);
}
if (!patient) {
return (
<div className="p-12 text-center">
<p className="text-slate-500 font-medium">Patient record not found.</p>
</div>
);
}
return (
<div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-w-5xl mx-auto">
{/* Header */}
<div className="bg-slate-900 p-8 text-white relative overflow-hidden">
<div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
<div className="relative flex justify-between items-start">
<div className="flex items-center gap-6">
<div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl font-black shadow-xl shadow-blue-900/20">
{patient.name.charAt(0)}
</div>
<div>
<div className="flex items-center gap-3 mb-1">
<h3 className="text-2xl font-black tracking-tight">{patient.name}</h3>
<span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black rounded-full uppercase tracking-widest border border-blue-500/30">
{patient.cardId}
</span>
</div>
<div className="flex items-center gap-4 text-slate-400 text-sm font-medium">
<span className="flex items-center gap-1.5"><User className="w-4 h-4" /> {patient.gender}, {patient.age}yrs</span>
<span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {patient.phone}</span>
<span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {patient.address}</span>
</div>
</div>
</div>
{onClose && (
<button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
<X className="w-6 h-6" />
</button>
)}
</div>
</div>
{/* Tabs */}
<div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-2 overflow-x-auto">
{[
{ id: 'visits', label: 'Consultations', icon: FolderOpen },
{ id: 'medical', label: 'Medical History', icon: ClipboardList },
{ id: 'labs', label: 'Lab Results', icon: FlaskConical },
{ id: 'financial', label: 'Financial Records', icon: Receipt }
].map((tab) => (
<button
key={tab.id}
onClick={() => setActiveTab(tab.id as any)}
className={cn(
"flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
activeTab === tab.id 
? "bg-white text-blue-600 shadow-sm border border-slate-200" 
: "text-slate-500 hover:bg-slate-100"
)}
>
<tab.icon className="w-4 h-4" />
{tab.label}
</button>
))}
</div>
{/* Content */}
<div className="p-8 max-h-[600px] overflow-y-auto bg-slate-50/30">
<AnimatePresence mode="wait">
{activeTab === 'visits' && (
<motion.div
key="visits"
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -10 }}
className="space-y-6"
>
{visits.length === 0 ? (
<div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
<FolderOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" />
<p className="text-slate-400 font-medium">No consultation visits found.</p>
</div>
) : (
visits.map((visit) => (
<div key={visit.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
<div className="flex justify-between items-start mb-6">
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
<FolderOpen className="w-5 h-5" />
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Visit Date</p>
<p className="font-bold text-slate-900">{format(new Date(visit.timestamp), 'MMMM d, yyyy HH:mm')}</p>
</div>
</div>
<div className="text-right">
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recorded By</p>
<p className="font-bold text-slate-900">Staff ID: {visit.staffId}</p>
</div>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
<div className="space-y-4">
<div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
<h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Diagnosis</h4>
<p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{visit.diagnosis || 'N/A'}</p>
</div>
<div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100">
<h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2">Lab Results</h4>
<p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{visit.labResults || 'N/A'}</p>
</div>
{visit.structuredLabNote && (
<div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100">
<h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2">Structured Lab Note</h4>
<p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{visit.structuredLabNote}</p>
</div>
)}
</div>
<div className="space-y-4">
<div className="p-4 bg-green-50/50 rounded-xl border border-green-100">
<h4 className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-2">Prescription</h4>
<p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{visit.prescription || 'N/A'}</p>
</div>
{visit.prescriptionNote && (
<div className="p-4 bg-green-50/50 rounded-xl border border-green-100">
<h4 className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-2">Prescription Note</h4>
<p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{visit.prescriptionNote}</p>
</div>
)}
<div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex justify-between items-center">
<div className="flex items-center gap-2">
<span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Billing Amount</span>
{visit.paymentStatus && (
<span className={cn(
"px-2 py-0.5 text-[10px] font-bold rounded-full uppercase",
visit.paymentStatus === 'paid' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
)}>
{visit.paymentStatus}
</span>
)}
</div>
<span className="font-black text-orange-700 text-lg">₦{(visit.billingAmount || 0).toLocaleString()}</span>
</div>
</div>
</div>
</div>
))
)}
</motion.div>
)}
{activeTab === 'medical' && (
<motion.div
key="medical"
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -10 }}
className="space-y-6"
>
{medicalRecords.length === 0 ? (
<div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
<ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
<p className="text-slate-400 font-medium">No medical records found.</p>
</div>
) : (
medicalRecords.map((record) => (
<div key={record.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
<div className="flex justify-between items-start mb-6">
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
<Activity className="w-5 h-5" />
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assessment Date</p>
<p className="font-bold text-slate-900">{format(new Date(record.createdAt), 'MMMM d, yyyy HH:mm')}</p>
</div>
</div>
<div className="text-right">
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recorded By</p>
<p className="font-bold text-slate-900">Staff ID: {record.staffId}</p>
</div>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
<div className="space-y-4">
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
<h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
<Heart className="w-3 h-3 text-red-500" /> Vitals
</h4>
<div className="grid grid-cols-2 gap-4">
<div>
<p className="text-[10px] text-slate-500 font-bold">BP</p>
<p className="text-sm font-black text-slate-900">{record.vitals?.bloodPressure || '-'}</p>
</div>
<div>
<p className="text-[10px] text-slate-500 font-bold">Temp</p>
<p className="text-sm font-black text-slate-900">{record.vitals?.temperature || '-'}</p>
</div>
<div>
<p className="text-[10px] text-slate-500 font-bold">Sugar</p>
<p className="text-sm font-black text-slate-900">{record.vitals?.sugarLevel || '-'}</p>
</div>
</div>
</div>
{record.diagnosis && (
<div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
<h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Diagnosis</h4>
<p className="text-sm text-slate-700 font-medium leading-relaxed">{record.diagnosis}</p>
</div>
)}
</div>
<div className="space-y-4">
{record.prescriptions && record.prescriptions.length > 0 && (
<div>
<div className="flex items-center gap-2 mb-2">
<h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prescriptions</h4>
{record.dispensed ? (
<span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">Dispensed</span>
) : (
<span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full uppercase">Pending</span>
)}
</div>
<div className="flex flex-wrap gap-2">
{record.prescriptions.map((p, i) => (
<span key={i} className="px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg shadow-sm">
{p}
</span>
))}
</div>
</div>
)}
{record.recommendedTests && record.recommendedTests.length > 0 && (
<div>
<h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recommended Tests</h4>
<div className="flex flex-wrap gap-2">
{record.recommendedTests.map((t, i) => (
<span key={i} className="px-3 py-1 bg-purple-50 border border-purple-100 text-purple-600 text-xs font-bold rounded-lg">
{t}
</span>
))}
</div>
</div>
)}
<div className="flex gap-4">
{record.admissionRecommended && (
<span className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-red-100">
Admission Recommended
</span>
)}
{record.cSectionRecommended && (
<span className="px-3 py-1 bg-orange-50 text-orange-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-orange-100">
C-Section Recommended
</span>
)}
</div>
{record.paymentFee && record.paymentFee > 0 && (
<div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex justify-between items-center mt-4">
<div className="flex items-center gap-2">
<span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Payment Fee</span>
{record.paymentStatus && (
<span className={cn(
"px-2 py-0.5 text-[10px] font-bold rounded-full uppercase",
record.paymentStatus === 'paid' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
)}>
{record.paymentStatus}
</span>
)}
</div>
<span className="font-black text-orange-700 text-lg">₦{record.paymentFee.toLocaleString()}</span>
</div>
)}
</div>
</div>
</div>
))
)}
</motion.div>
)}
{activeTab === 'labs' && (
<motion.div
key="labs"
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -10 }}
className="space-y-4"
>
{labTests.length === 0 ? (
<div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
<FlaskConical className="w-12 h-12 text-slate-200 mx-auto mb-4" />
<p className="text-slate-400 font-medium">No lab results found.</p>
</div>
) : (
<div className="grid grid-cols-1 gap-4">
{labTests.map((test) => (
<div key={test.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center group">
<div className="flex items-center gap-4">
<div className={cn(
"w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
test.result ? "bg-green-50 text-green-600" : "bg-orange-50 text-orange-600"
)}>
<FlaskConical className="w-6 h-6" />
</div>
<div>
<p className="font-bold text-slate-900">{test.testType}</p>
<p className="text-xs text-slate-400">{format(new Date(test.createdAt), 'MMM d, yyyy HH:mm')}</p>
</div>
</div>
<div className="text-right">
{test.result ? (
<div className="space-y-1">
<p className="text-xs font-bold text-green-600 uppercase tracking-widest">Result Ready</p>
{test.structuredResults && test.structuredResults.length > 0 ? (
<div className="text-left mt-2 border border-slate-100 rounded-lg overflow-hidden">
<table className="w-full text-xs">
<thead className="bg-slate-50 text-slate-500">
<tr>
<th className="px-2 py-1 font-semibold">Parameter</th>
<th className="px-2 py-1 font-semibold">Result</th>
<th className="px-2 py-1 font-semibold">Range</th>
<th className="px-2 py-1 font-semibold">Unit</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-100">
{test.structuredResults.map((r, i) => (
<tr key={i}>
<td className="px-2 py-1 font-medium text-slate-700">{r.parameter}</td>
<td className="px-2 py-1 font-bold text-slate-900">{r.result}</td>
<td className="px-2 py-1 text-slate-500">{r.range}</td>
<td className="px-2 py-1 text-slate-500">{r.unit}</td>
</tr>
))}
</tbody>
</table>
</div>
) : (
<p className="text-sm font-medium text-slate-700 max-w-xs truncate">{test.result}</p>
)}
</div>
) : (
<span className="px-3 py-1 bg-orange-50 text-orange-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-orange-100">
Pending
</span>
)}
</div>
</div>
))}
</div>
)}
</motion.div>
)}
{activeTab === 'financial' && (
<motion.div
key="financial"
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -10 }}
className="space-y-4"
>
{financialRecords.length === 0 ? (
<div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
<Receipt className="w-12 h-12 text-slate-200 mx-auto mb-4" />
<p className="text-slate-400 font-medium">No financial records found.</p>
</div>
) : (
<div className="space-y-4">
{financialRecords.map((record) => (
<div key={record.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
<div className="flex justify-between items-start mb-6">
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
<Receipt className="w-5 h-5" />
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Transaction Date</p>
<p className="font-bold text-slate-900">{format(new Date(record.createdAt), 'MMMM d, yyyy HH:mm')}</p>
</div>
</div>
<span className={cn(
"px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest border",
record.paymentStatus === 'fully paid' 
? "bg-green-50 text-green-600 border-green-100" 
: "bg-orange-50 text-orange-600 border-orange-100"
)}>
{record.paymentStatus}
</span>
</div>
<div className="grid grid-cols-3 gap-6">
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Total Bill</p>
<p className="text-xl font-black text-slate-900">₦{record.totalAmount.toLocaleString()}</p>
</div>
<div className="p-4 bg-green-50/50 rounded-xl border border-green-100">
<p className="text-[10px] text-green-600 font-bold uppercase tracking-widest mb-1">Amount Paid</p>
<p className="text-xl font-black text-green-700">₦{record.paidAmount.toLocaleString()}</p>
</div>
<div className="p-4 bg-red-50/50 rounded-xl border border-red-100">
<p className="text-[10px] text-red-600 font-bold uppercase tracking-widest mb-1">Balance Due</p>
<p className="text-xl font-black text-red-700">₦{record.pendingAmount.toLocaleString()}</p>
</div>
</div>
<div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
<ChevronRight className="w-3 h-3" /> Payment Method: {record.paymentMethod}
</div>
</div>
))}
</div>
)}
</motion.div>
)}
</AnimatePresence>
</div>
</div>
);
};
