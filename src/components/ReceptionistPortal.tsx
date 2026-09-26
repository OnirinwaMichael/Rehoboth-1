import React, { useState, useEffect, useMemo, memo } from 'react';
import { supabase, handleSupabaseError, fetchAllRows } from '../lib/supabase';
import { Patient, Appointment, User, RegistrationFeeSettings } from '../types';
import { toast } from 'sonner';
import { UserPlus, Search, CreditCard, User as UserIcon, Phone, MapPin, Calendar, Briefcase, Heart, LayoutDashboard, Users as UsersIcon, History, X, Clock, Plus, Edit, Trash2, CheckCircle, AlertCircle, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { logAction } from '../lib/audit';
import { useFormDraft } from '../hooks/useFormDraft';
import { generatePatientRegister } from '../lib/excel';
import { Download } from 'lucide-react';
// --- DB <-> app-shape mappers (keep every other line of this file,
// and every other component, working with the same camelCase field
// names as before — only these functions know about snake_case) ---
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
antenatalStatus: r.antenatal_status,
});
const patientToRow = (p: any) => ({
name: p.name, gender: p.gender, state_of_origin: p.stateOfOrigin,
age: p.age, occupation: p.occupation, address: p.address, phone: p.phone,
next_of_kin: p.nextOfKin, relationship: p.relationship, nok_address: p.nokAddress,
nok_phone: p.nokPhone, category: p.category,
antenatal_status: p.category === 'antenatal' ? (p.antenatalStatus || 'new') : null,
});
const appointmentFromRow = (r: any): Appointment => ({
id: r.id, patientId: r.patient_id, patientName: r.patient_name,
doctorId: r.doctor_id, doctorName: r.doctor_name, date: r.date, time: r.time,
reason: r.reason, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
});
const appointmentToRow = (a: any) => ({
patient_id: a.patientId, patient_name: a.patientName, doctor_id: a.doctorId || null,
doctor_name: a.doctorName, date: a.date, time: a.time, reason: a.reason, status: a.status,
});
const userFromRow = (r: any): User => ({
uid: r.id, email: r.email, role: r.role, name: r.name, status: r.status,
photoURL: r.photo_url, phone: r.phone,
});
import { motion, AnimatePresence } from 'motion/react';
import { PatientHistory } from './PatientHistory';
import { ConfirmModal } from './ConfirmModal';
import { FinancePortal } from './FinancePortal';
interface Props {
userId: string;
section: 'dashboard' | 'register' | 'appointments' | 'directory' | 'patients' | 'finance' | 'reconciliation' | 'expenses' | 'reports';
onNavigate?: (view: string) => void;
}
const PatientCard = memo(({ patient }: { patient: Patient }) => (
<div className="p-4 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-slate-50 transition-colors">
<div className="flex justify-between items-start mb-1">
<p className="font-bold text-slate-900">{patient.name}</p>
<span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase">
{patient.cardId}
</span>
</div>
<p className="text-xs text-slate-500">{patient.category}</p>
<p className="text-[10px] text-slate-400 mt-2">{format(new Date(patient.createdAt), 'MMM d, yyyy HH:mm')}</p>
</div>
));
export const ReceptionistPortal: React.FC<Props> = ({ userId, section, onNavigate }) => {
const [loading, setLoading] = useState(false);
const [patients, setPatients] = useState<Patient[]>([]);
const [appointments, setAppointments] = useState<Appointment[]>([]);
const [doctors, setDoctors] = useState<User[]>([]);
const OWN_SECTIONS = ['dashboard', 'register', 'appointments', 'directory'] as const;
const [view, setView] = useState<'dashboard' | 'register' | 'appointments' | 'directory'>(
(OWN_SECTIONS as readonly string[]).includes(section) ? (section as any) : 'dashboard'
);
useEffect(() => {
if ((OWN_SECTIONS as readonly string[]).includes(section)) setView(section as any);
}, [section]);
const [allPatients, setAllPatients] = useState<Patient[]>([]);
const [patientsLoading, setPatientsLoading] = useState(false);
const [patientsLoadError, setPatientsLoadError] = useState(false);
const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
const [editCardId, setEditCardId] = useState('');
const [searchQuery, setSearchQuery] = useState('');
const [stats, setStats] = useState({
total: 0,
today: 0,
appointmentsToday: 0,
pendingBills: 0
});
const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
const [showHistory, setShowHistory] = useState(false);
const [showAppointmentModal, setShowAppointmentModal] = useState(false);
const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
const [patientToDelete, setPatientToDelete] = useState<string | null>(null);
const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);
const [entryMode, setEntryMode] = useState<'auto' | 'manual'>('auto');
const [manualCardId, setManualCardId] = useState('');
const [directoryFilter, setDirectoryFilter] = useState<'all' | 'fresh' | 'old'>('all');
const [directoryTodayOnly, setDirectoryTodayOnly] = useState(false);
const [directoryPage, setDirectoryPage] = useState(1);
const DIRECTORY_PAGE_SIZE = 50;
useEffect(() => { setDirectoryPage(1); }, [searchQuery, directoryFilter, directoryTodayOnly]);
const filteredDirectoryPatients = useMemo(() => {
const q = searchQuery.toLowerCase();
const todayStr = new Date().toISOString().split('T')[0];
return allPatients
.filter(p => p.name.toLowerCase().includes(q) || p.cardId.includes(searchQuery))
.filter(p => directoryFilter === 'all' || p.registrationType === directoryFilter)
.filter(p => !directoryTodayOnly || p.createdAt.startsWith(todayStr));
}, [allPatients, searchQuery, directoryFilter, directoryTodayOnly]);
const directoryPageCount = Math.max(1, Math.ceil(filteredDirectoryPatients.length / DIRECTORY_PAGE_SIZE));
const pagedDirectoryPatients = useMemo(() => {
const start = (directoryPage - 1) * DIRECTORY_PAGE_SIZE;
return filteredDirectoryPatients.slice(start, start + DIRECTORY_PAGE_SIZE);
}, [filteredDirectoryPatients, directoryPage]);
const [exporting, setExporting] = useState(false);
const [regFees, setRegFees] = useState<RegistrationFeeSettings | null>(null);
const [showFeeEditor, setShowFeeEditor] = useState(false);
const [feeEditorForm, setFeeEditorForm] = useState({ single: '', family: '', antenatalNew: '', antenatalReturning: '' });
const [pendingRegPayment, setPendingRegPayment] = useState<{ cardId: string; name: string; amount: string; method: 'cash' | 'bank transfer' } | null>(null);
const getRegistrationFee = (category: Patient['category'], antenatalStatus?: 'new' | 'returning'): number => {
if (!regFees) return 0;
if (category === 'single card') return regFees.singleCardPrice;
if (category === 'family card') return regFees.familyCardPrice;
if (category === 'antenatal') return antenatalStatus === 'returning' ? regFees.antenatalReturningPrice : regFees.antenatalNewPrice;
return 0; // children's card has no set price yet
};
const fetchRegFees = async () => {
const { data, error } = await supabase.from('registration_fee_settings').select('*').eq('id', 1).maybeSingle();
if (error) return handleSupabaseError(error, 'select', 'registration_fee_settings');
if (data) {
setRegFees({
singleCardPrice: data.single_card_price, familyCardPrice: data.family_card_price,
antenatalNewPrice: data.antenatal_new_price, antenatalReturningPrice: data.antenatal_returning_price,
updatedAt: data.updated_at,
});
}
};
const handleSaveFees = async (e: React.FormEvent) => {
e.preventDefault();
const { error } = await supabase.from('registration_fee_settings').update({
single_card_price: parseFloat(feeEditorForm.single) || 0,
family_card_price: parseFloat(feeEditorForm.family) || 0,
antenatal_new_price: parseFloat(feeEditorForm.antenatalNew) || 0,
antenatal_returning_price: parseFloat(feeEditorForm.antenatalReturning) || 0,
updated_at: new Date().toISOString(),
}).eq('id', 1);
if (error) return handleSupabaseError(error, 'update', 'registration_fee_settings');
await logAction(userId, 'UPDATE_REGISTRATION_FEES', 'Updated patient registration card prices');
toast.success('Prices updated!');
setShowFeeEditor(false);
fetchRegFees();
};
const handleConfirmRegPayment = async () => {
if (!pendingRegPayment) return;
const amount = parseFloat(pendingRegPayment.amount);
if (!amount || amount <= 0) { toast.error('Enter a valid amount.'); return; }
try {
const { error } = await supabase.from('financials').insert({
patient_id: pendingRegPayment.cardId,
total_amount: amount,
paid_amount: amount,
pending_amount: 0,
payment_status: 'fully paid',
payment_method: pendingRegPayment.method,
reference_type: 'registration',
});
if (error) throw error;
await logAction(userId, 'RECORD_ITEM_PAYMENT', `Recorded ₦${amount} registration payment for ${pendingRegPayment.name} (${pendingRegPayment.cardId})`);
toast.success('Registration payment recorded!');
setPendingRegPayment(null);
} catch (error) {
handleSupabaseError(error, 'insert', 'financials');
}
};
const initialFormData = {
name: '',
gender: 'male' as 'male' | 'female',

stateOfOrigin: '',
age: '',
occupation: '',
address: '',
phone: '',
nextOfKin: '',
relationship: '',
nokAddress: '',
nokPhone: '',
category: 'single card' as Patient['category'],
antenatalStatus: 'new' as 'new' | 'returning'
};
const { data: formData, setData: setFormData, clearDraft: clearFormDraft } = useFormDraft('patient_registration', initialFormData);
const { data: appointmentForm, setData: setAppointmentForm, clearDraft: clearAppointmentDraft } = useFormDraft('appointment_form', {
patientId: '',
patientName: '',
doctorId: '',
doctorName: '',
date: format(new Date(), 'yyyy-MM-dd'),
time: '09:00',
reason: ''
});
useEffect(() => {
fetchRecentPatients();
fetchAllPatients();
fetchDoctors();
fetchAppointments();
fetchPendingBillsCount();
fetchRegFees();
// Realtime subscription (replaces onSnapshot)
const channel = supabase
.channel('appointments-changes')
.on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
fetchAppointments();
})
.on('postgres_changes', { event: '*', schema: 'public', table: 'financials' }, () => {
fetchPendingBillsCount();
})
.on('postgres_changes', { event: '*', schema: 'public', table: 'registration_fee_settings' }, () => {
fetchRegFees();
})
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchPendingBillsCount = async () => {
const { count, error } = await supabase
.from('financials')
.select('*', { count: 'exact', head: true })
.neq('payment_status', 'fully paid');
if (error) return handleSupabaseError(error, 'select', 'financials');
setStats(prev => ({ ...prev, pendingBills: count || 0 }));
};
// Real trend data for the dashboard sparklines — derived from data
// already fetched (allPatients/appointments), no extra round trips.
const last7DaysRegistrations = useMemo(() => {
const days: { label: string; count: number }[] = [];
for (let i = 6; i >= 0; i--) {
const d = new Date();
d.setDate(d.getDate() - i);
const key = format(d, 'yyyy-MM-dd');
days.push({ label: format(d, 'EEE'), count: allPatients.filter(p => p.createdAt.startsWith(key)).length });
}
return days;
}, [allPatients]);
const registrationsTrendPct = useMemo(() => {
let thisWeek = 0, prevWeek = 0;
for (let i = 0; i <= 13; i++) {
const d = new Date();
d.setDate(d.getDate() - i);
const key = format(d, 'yyyy-MM-dd');
const count = allPatients.filter(p => p.createdAt.startsWith(key)).length;
if (i <= 6) thisWeek += count; else prevWeek += count;
}
if (prevWeek === 0) return thisWeek > 0 ? 100 : 0;
return Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
}, [allPatients]);
const last7DaysAppointments = useMemo(() => {
const days: { label: string; count: number }[] = [];
for (let i = 6; i >= 0; i--) {
const d = new Date();
d.setDate(d.getDate() - i);
const key = format(d, 'yyyy-MM-dd');
days.push({ label: format(d, 'EEE'), count: appointments.filter(a => a.date === key && a.status === 'scheduled').length });
}
return days;
}, [appointments]);
const appointmentsTrendPct = useMemo(() => {
const today = last7DaysAppointments[6]?.count ?? 0;
const yesterday = last7DaysAppointments[5]?.count ?? 0;
if (yesterday === 0) return today > 0 ? 100 : 0;
return Math.round(((today - yesterday) / yesterday) * 100);
}, [last7DaysAppointments]);
const patientsByCategory = useMemo(() => {
const counts: Record<string, number> = {};
allPatients.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
const colors: Record<string, string> = {
'single card': '#0d9488', 'family card': '#7c3aed', 'antenatal': '#f97316', "children's card": '#0ea5e9',
};
const labels: Record<string, string> = {
'single card': 'Single Card', 'family card': 'Family Card', 'antenatal': 'Antenatal', "children's card": "Children's Card",
};
const total = allPatients.length || 1;
const circumference = 2 * Math.PI * 70;
let cumulative = 0;
return Object.entries(counts)
.map(([key, count]) => ({ key, label: labels[key] || key, count, color: colors[key] || '#64748b', pct: Math.round((count / total) * 100) }))
.sort((a, b) => b.count - a.count)
.map(seg => {
const length = (seg.count / total) * circumference;
const dasharray = `${length} ${circumference - length}`;
const dashoffset = -cumulative;
cumulative += length;
return { ...seg, dasharray, dashoffset };
});
}, [allPatients]);
const fetchAppointments = async () => {
const { data, error } = await supabase
.from('appointments')
.select('*')
.order('date', { ascending: true })
.order('time', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'appointments');
const mapped = (data || []).map(appointmentFromRow);
setAppointments(mapped);
const today = format(new Date(), 'yyyy-MM-dd');
const todayCount = mapped.filter(a => a.date === today && a.status === 'scheduled').length;
setStats(prev => ({ ...prev, appointmentsToday: todayCount }));
};
const fetchAllPatients = async () => {
setPatientsLoading(true);
const { data: allRows, error } = await fetchAllRows<any>('patients');
if (error) {
console.error('[Supabase:patients:select]', error instanceof Error ? error.message : String(error));
setPatientsLoadError(true);
toast.error('Could not load the full patient list - showing what was last loaded. Check your connection and try again.');
setPatientsLoading(false);
return;
}
const sorted = allRows.map(patientFromRow)
.sort((a, b) => a.cardId.localeCompare(b.cardId, undefined, { numeric: true, sensitivity: 'base' }));
setAllPatients(sorted);
setPatientsLoadError(false);
setPatientsLoading(false);
};
const handleExportRegister = () => {
if (allPatients.length === 0) {
toast.error('No patients to export yet.');
return;
}
setExporting(true);
try {
generatePatientRegister(allPatients);
toast.success('Patient register downloaded.');
} catch (error) {
toast.error('Could not generate the spreadsheet. Please try again.');
} finally {
setExporting(false);
}
};
const fetchDoctors = async () => {
const { data, error } = await supabase
.from('users')
.select('*')
.eq('role', 'Doctor')
.eq('status', 'active');
if (error) return handleSupabaseError(error, 'select', 'users');
setDoctors((data || []).map(userFromRow));
};
const fetchRecentPatients = async () => {
const { data, error } = await supabase
.from('patients')
.select('*')
.order('created_at', { ascending: false })
.limit(10);
if (error) return handleSupabaseError(error, 'select', 'patients');
setPatients((data || []).map(patientFromRow));
const { count: total } = await supabase.from('patients').select('*', { count: 'exact', head: true });
const today = new Date().toISOString().split('T')[0];
const { count: todayCount } = await supabase
.from('patients')
.select('*', { count: 'exact', head: true })
.gte('created_at', `${today}T00:00:00`)
.lt('created_at', `${today}T23:59:59.999`);
setStats(prev => ({ ...prev, total: total || 0, today: todayCount || 0 }));
};
// Card IDs are generated by a Postgres sequence-backed function so
// concurrent registrations never collide (replaces the Firestore
// counter-document + transaction pattern).
const generateCardId = async (): Promise<string> => {
const { data, error } = await supabase.rpc('next_patient_card_id');
if (error) throw error;
return data as string;
};
const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
if (entryMode === 'manual' && !manualCardId.trim()) {
toast.error('Enter the existing file/registration number, or switch to Auto-generate.');
return;
}
setLoading(true);
try {
const cardId = entryMode === 'manual' ? manualCardId.trim() : await generateCardId();
const registrationType = entryMode === 'manual' ? 'old' : 'fresh';
const { error } = await supabase.from('patients').insert({
card_id: cardId,
registration_type: registrationType,
...patientToRow(formData),
});
if (error) {
// Postgres unique_violation — someone already holds this card_id
if ((error as any).code === '23505') {
toast.error(`Card ID "${cardId}" is already in use by another patient. Please check and try a different number.`);
return;
}
throw error;
}
if (entryMode === 'manual') {
// Advance the auto-number sequence past this manual entry so a
// future Fresh registration can never collide with it.
await supabase.rpc('bump_patient_card_id_seq', { p_card_id: cardId });
}
await logAction(userId, 'REGISTER_PATIENT', `Registered ${registrationType === 'old' ? 'existing-file' : 'new'} patient ${formData.name} with Card ID ${cardId}`);
toast.success('Patient registered successfully!');
clearFormDraft();
setManualCardId('');
fetchRecentPatients();
if (entryMode === 'auto') {
// New file being opened right now - offer to record the card fee
// immediately, pre-filled from the current price settings.
const fee = getRegistrationFee(formData.category, formData.antenatalStatus);
setPendingRegPayment({ cardId, name: formData.name, amount: fee ? String(fee) : '', method: 'cash' });
}
// Old/Existing-file registrations: stay on the registration form (already
// cleared above) so the receptionist can keep entering more old cards
// without being bounced back to the dashboard.
setEntryMode('auto');
} catch (error) {
handleSupabaseError(error, 'insert', 'patients');
} finally {
setLoading(false);
}
};
const handleAppointmentSubmit = async (e: React.FormEvent) => {
e.preventDefault();
setLoading(true);
try {
const selectedDoctor = doctors.find(d => d.uid === appointmentForm.doctorId);
const row = appointmentToRow({
...appointmentForm,
doctorName: selectedDoctor?.name || 'Unknown Doctor',
status: editingAppointment ? editingAppointment.status : 'scheduled',
});
if (editingAppointment) {
const { error } = await supabase.from('appointments').update(row).eq('id', editingAppointment.id);
if (error) throw error;
await logAction(userId, 'UPDATE_APPOINTMENT', `Updated appointment for ${row.patient_name}`);
toast.success('Appointment updated!');
} else {
const { error } = await supabase.from('appointments').insert(row);
if (error) throw error;
await logAction(userId, 'BOOK_APPOINTMENT', `Booked appointment for ${row.patient_name}`);
toast.success('Appointment booked!');
}
setShowAppointmentModal(false);
setEditingAppointment(null);
clearAppointmentDraft();
fetchAppointments();
} catch (error) {
handleSupabaseError(error, 'upsert', 'appointments');
} finally {
setLoading(false);
}
};
const handleStatusChange = async (id: string, status: Appointment['status']) => {
const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
if (error) return handleSupabaseError(error, 'update', 'appointments');
toast.success(`Appointment marked as ${status}`);
fetchAppointments();
};
const handleEditPatient = async (e: React.FormEvent) => {
e.preventDefault();
if (!editingPatient) return;
const newCardId = editCardId.trim();
if (!newCardId) {
toast.error('Card ID cannot be empty.');
return;
}
setLoading(true);
try {
const { error } = await supabase
.from('patients')
.update({ ...patientToRow(formData), card_id: newCardId })
.eq('card_id', editingPatient.cardId);
if (error) {
if ((error as any).code === '23505') {
toast.error(`Card ID "${newCardId}" is already in use by another patient. Please choose a different number.`);
setLoading(false);
return;
}
throw error;
}
await logAction(userId, 'UPDATE_PATIENT', `Updated patient ${formData.name}${newCardId !== editingPatient.cardId ? ` (Card ID changed from ${editingPatient.cardId} to ${newCardId})` : ` with Card ID ${editingPatient.cardId}`}`);
toast.success('Patient updated successfully!');
setEditingPatient(null);
setEditCardId('');
setFormData({
name: '', gender: 'male', stateOfOrigin: '', age: '',
occupation: '', address: '', phone: '', nextOfKin: '',
relationship: '', nokAddress: '', nokPhone: '', category: 'single card', antenatalStatus: 'new'
});
fetchRecentPatients();
fetchAllPatients();
setView('directory');
} catch (error) {
handleSupabaseError(error, 'update', 'patients');
} finally {
setLoading(false);
}
};
const handleDeletePatient = async (id: string) => {
setLoading(true);
try {
// All child tables (medical_records, lab_tests, financials,
// appointments, visits, patient_allergies, patient_consents)
// have `on delete cascade` foreign keys to patients.card_id, so
// one delete here removes everything — no manual multi-table
// loop needed like the old Firestore version required.
const { error } = await supabase.from('patients').delete().eq('card_id', id);
if (error) throw error;
await logAction(userId, 'DELETE_PATIENT_FULL', `Deleted patient ${id} and all associated records`);
toast.success('Patient and all records deleted successfully');
setPatientToDelete(null);
fetchRecentPatients();
fetchAllPatients();
} catch (error) {
handleSupabaseError(error, 'delete', 'patients');
} finally {
setLoading(false);
}
};
const deleteAppointment = async (id: string) => {
const { error } = await supabase.from('appointments').delete().eq('id', id);
if (error) return handleSupabaseError(error, 'delete', 'appointments');
toast.success('Appointment deleted');
fetchAppointments();
};
if (section === 'patients' || section === 'finance' || section === 'reconciliation' || section === 'expenses' || section === 'reports') {
return <FinancePortal userId={userId} section={section} />;
}
return (
<div className="space-y-8 max-w-6xl mx-auto">
<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
<div>
<h2 className="text-3xl font-bold text-slate-900">
{view === 'dashboard' ? 'Dashboard' : view === 'register' ? (editingPatient ? 'Edit Patient Record' : 'Patient Registration') :
view === 'appointments' ? 'Appointment' : 'Patient Directory'}
</h2>
<p className="text-slate-500">
{view === 'dashboard' ? 'Front desk overview for today.' :
view === 'register' ? 'Register new patients and digitize old files.' :
view === 'appointments' ? 'Book and manage patient appointments.' :
'Search, view, and edit every patient on file.'}
</p>
</div>
</div>
{view === 'dashboard' && (
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
<button
type="button"
onClick={() => { setDirectoryFilter('all'); setDirectoryTodayOnly(false); setView('directory'); }}
className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-left hover:border-teal-200 hover:shadow-md transition-all"
>
<div className="flex items-center justify-between mb-4">
<div className="flex items-center gap-2">
<span className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center">
<UsersIcon className="w-4 h-4" />
</span>
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Patients</p>
</div>
</div>
<div className="flex items-end justify-between gap-4">
<h4 className="text-3xl font-black text-slate-900">{stats.total}</h4>
<div className="flex items-end gap-0.5 h-8">
{last7DaysRegistrations.map((d, i) => {
const max = Math.max(...last7DaysRegistrations.map(x => x.count), 1);
return (
<div key={i} className={cn("w-1.5 rounded-sm", i === 6 ? "bg-teal-500" : "bg-slate-200")}
style={{ height: `${Math.max((d.count / max) * 100, 8)}%` }} title={`${d.label}: ${d.count}`} />
);
})}
</div>
</div>
<div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50 text-xs">
<span className="text-slate-400">vs last week</span>
<span className={cn("flex items-center gap-1 font-bold px-1.5 py-0.5 rounded-full", registrationsTrendPct >= 0 ? "text-teal-600 bg-teal-50" : "text-red-500 bg-red-50")}>
{registrationsTrendPct >= 0 ? '↑' : '↓'} {Math.abs(registrationsTrendPct)}%
</span>
</div>
</button>
<button
type="button"
onClick={() => { setDirectoryFilter('all'); setDirectoryTodayOnly(true); setView('directory'); }}
className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6 text-left hover:border-emerald-200 hover:shadow-md transition-all"
>
<div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
<UserPlus className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">New Today</p>
<h4 className="text-3xl font-black text-slate-900">{stats.today}</h4>
</div>
</button>
<button
type="button"
onClick={() => setView('appointments')}
className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-left hover:border-violet-200 hover:shadow-md transition-all"
>
<div className="flex items-center justify-between mb-4">
<div className="flex items-center gap-2">
<span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
<Calendar className="w-4 h-4" />
</span>
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Appts</p>
</div>
</div>
<div className="flex items-end justify-between gap-4">
<h4 className="text-3xl font-black text-slate-900">{stats.appointmentsToday}</h4>
<div className="flex items-end gap-0.5 h-8">
{last7DaysAppointments.map((d, i) => {
const max = Math.max(...last7DaysAppointments.map(x => x.count), 1);
return (
<div key={i} className={cn("w-1.5 rounded-sm", i === 6 ? "bg-violet-500" : "bg-slate-200")}
style={{ height: `${Math.max((d.count / max) * 100, 8)}%` }} title={`${d.label}: ${d.count}`} />
);
})}
</div>
</div>
<div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50 text-xs">
<span className="text-slate-400">vs yesterday</span>
<span className={cn("flex items-center gap-1 font-bold px-1.5 py-0.5 rounded-full", appointmentsTrendPct >= 0 ? "text-violet-600 bg-violet-50" : "text-red-500 bg-red-50")}>
{appointmentsTrendPct >= 0 ? '↑' : '↓'} {Math.abs(appointmentsTrendPct)}%
</span>
</div>
</button>
<button
onClick={() => onNavigate?.('Finance')}
className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6 text-left hover:border-orange-200 transition-all"
>
<div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600">
<DollarSign className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pending Bills</p>
<h4 className="text-3xl font-black text-slate-900">{stats.pendingBills}</h4>
</div>
</button>
<div className="lg:col-span-3 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Activity
</h3>
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
{patients.map((p, idx) => (
<button 
key={idx} 
onClick={() => {
setSelectedPatientId(p.cardId);
setShowHistory(true);
}}
className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 text-left hover:bg-blue-50/50 transition-all group"
>
<div className="flex justify-between items-start mb-2">
<p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{p.name}</p>
<span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase">
{p.cardId}
</span>
</div>
<p className="text-xs text-slate-500">{p.category}</p>
<p className="text-[10px] text-slate-400 mt-2">{format(new Date(p.createdAt), 'MMM d, yyyy HH:mm')}</p>
</button>
))}
</div>
</div>
<div className="lg:col-span-1 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6">Patients by Category</h3>
{allPatients.length === 0 ? (
<p className="text-sm text-slate-400 text-center py-8">No patients yet.</p>
) : (
<>
<div className="relative w-44 h-44 mx-auto mb-6">
<svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
{patientsByCategory.map(seg => (
<circle
key={seg.key}
cx="100" cy="100" r="70"
fill="none"
stroke={seg.color}
strokeWidth="24"
strokeDasharray={seg.dasharray}
strokeDashoffset={seg.dashoffset}
/>
))}
</svg>
<div className="absolute inset-0 flex flex-col items-center justify-center">
<span className="text-2xl font-black text-slate-900">{allPatients.length}</span>
<span className="text-[10px] text-slate-400 uppercase tracking-wider">Total</span>
</div>
</div>
<div className="space-y-2">
{patientsByCategory.map(seg => (
<div key={seg.key} className="flex items-center justify-between text-xs">
<div className="flex items-center gap-2 min-w-0">
<span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
<span className="text-slate-600 truncate capitalize">{seg.label}</span>
</div>
<span className="font-bold text-slate-900 shrink-0">{seg.pct}%</span>
</div>
))}
</div>
</>
)}
</div>
</div>
)}
{view === 'register' && (
<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
<div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
<UserPlus className="w-5 h-5 text-blue-600" />
<h3 className="font-bold text-slate-900">{editingPatient ? 'Edit Patient Record' : 'New Patient Registration'}</h3>
</div>
<form onSubmit={editingPatient ? handleEditPatient : handleSubmit} className="p-8 space-y-6">
{!editingPatient && (
<div className="space-y-3 pb-2 border-b border-slate-100">
<label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
<CreditCard className="w-4 h-4" /> Registration Number
</label>
<div className="flex gap-2">
<button
type="button"
onClick={() => { setEntryMode('auto'); setManualCardId(''); }}
className={cn(
"flex-1 p-3 rounded-xl border text-sm font-semibold transition-all text-left",
entryMode === 'auto' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
)}
>
Fresh / Complete New Patient
<span className="block font-normal text-xs text-slate-500 mt-0.5">System auto-generates the next number</span>
</button>
<button
type="button"
onClick={() => setEntryMode('manual')}
className={cn(
"flex-1 p-3 rounded-xl border text-sm font-semibold transition-all text-left",
entryMode === 'manual' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
)}
>
Old / Already Existing File
<span className="block font-normal text-xs text-slate-500 mt-0.5">Enter their existing paper-file number</span>
</button>
</div>
{entryMode === 'manual' && (
<input
required
value={manualCardId}
onChange={e => setManualCardId(e.target.value)}
placeholder="e.g. 000045"
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
/>
)}
</div>
)}
{editingPatient && (
<div className="space-y-2 pb-2 border-b border-slate-100">
<label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
<CreditCard className="w-4 h-4" /> Card ID
</label>
<input
required
value={editCardId}
onChange={e => setEditCardId(e.target.value)}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
placeholder="e.g. 000045"
/>
{editCardId !== editingPatient.cardId && (
<p className="text-xs text-amber-600">This will change the patient's registration number everywhere — all their records move with it.</p>
)}
</div>
)}
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
<UserIcon className="w-4 h-4" /> Full Name
</label>
<input
required
value={formData.name}
onChange={e => setFormData({ ...formData, name: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
placeholder="John Doe"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
<CreditCard className="w-4 h-4" /> Card Category
</label>
<select
value={formData.category}
onChange={e => setFormData({ ...formData, category: e.target.value as any })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="single card">Single Card</option>
<option value="family card">Family Card</option>
<option value="antenatal">Antenatal</option>
<option value="children's card">Children's Card</option>
</select>
{!editingPatient && entryMode === 'auto' && formData.category === 'antenatal' && (
<div className="flex gap-2 pt-1">
<button
type="button"
onClick={() => setFormData({ ...formData, antenatalStatus: 'new' })}
className={cn(
"flex-1 py-2 rounded-lg border text-xs font-bold transition-all",
formData.antenatalStatus === 'new' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
)}
>
New Registration
</button>
<button
type="button"
onClick={() => setFormData({ ...formData, antenatalStatus: 'returning' })}
className={cn(
"flex-1 py-2 rounded-lg border text-xs font-bold transition-all",
formData.antenatalStatus === 'returning' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
)}
>
Returning Patient
</button>
</div>
)}
{!editingPatient && entryMode === 'auto' && (
<p className="text-xs text-slate-400 pt-1">
Registration fee: <span className="font-bold text-slate-600">₦{getRegistrationFee(formData.category, formData.antenatalStatus).toLocaleString()}</span>
{formData.category === "children's card" && ' (no price set)'}
{' · '}
<button
type="button"
onClick={() => {
if (regFees) {
setFeeEditorForm({
single: String(regFees.singleCardPrice), family: String(regFees.familyCardPrice),
antenatalNew: String(regFees.antenatalNewPrice), antenatalReturning: String(regFees.antenatalReturningPrice),
});
}
setShowFeeEditor(true);
}}
className="text-blue-600 hover:underline font-bold"
>
Edit prices
</button>
</p>
)}
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700">Gender</label>
<select
value={formData.gender}
onChange={e => setFormData({ ...formData, gender: e.target.value as any })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="male">Male</option>
<option value="female">Female</option>
</select>
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700">Age</label>
<input
type="text"
required
value={formData.age}
onChange={e => setFormData({ ...formData, age: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="e.g. 25, 3 months, 2 weeks, 90+"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
<Briefcase className="w-4 h-4" /> Occupation
</label>
<input
value={formData.occupation}
onChange={e => setFormData({ ...formData, occupation: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="e.g. Trader, Civil Servant, Student"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
<Phone className="w-4 h-4" /> Phone Number
</label>
<input
required
value={formData.phone}
onChange={e => setFormData({ ...formData, phone: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="08012345678"
/>
</div>
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
<MapPin className="w-4 h-4" /> Address
</label>
<textarea
required
value={formData.address}
onChange={e => setFormData({ ...formData, address: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
placeholder="Residential address"
/>
</div>
<div className="border-t border-slate-100 pt-6">
<h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
<Heart className="w-4 h-4 text-red-500" /> Next of Kin Information
</h4>
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700">NOK Name</label>
<input
required
value={formData.nextOfKin}
onChange={e => setFormData({ ...formData, nextOfKin: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700">Relationship</label>
<input
required
value={formData.relationship}
onChange={e => setFormData({ ...formData, relationship: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-semibold text-slate-700">NOK Phone</label>
<input
required
value={formData.nokPhone}
onChange={e => setFormData({ ...formData, nokPhone: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
</div>
</div>
</div>
<div className="flex gap-4">
<button
type="submit"
disabled={loading}
className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
>
{loading ? 'Processing...' : (editingPatient ? 'Update Patient Record' : 'Register Patient & Assign Card')}
</button>
{editingPatient && (
<button
type="button"
onClick={() => {
setEditingPatient(null);
setEditCardId('');
setFormData({
name: '', gender: 'male', stateOfOrigin: '', age: '',
occupation: '', address: '', phone: '', nextOfKin: '',
relationship: '', nokAddress: '', nokPhone: '', category: 'single card', antenatalStatus: 'new'
});
setView('directory');
}}
className="px-8 bg-slate-100 text-slate-600 py-4 rounded-xl font-bold text-lg hover:bg-slate-200 transition-all"
>
Cancel
</button>
)}
</div>
</form>
</div>
<div className="space-y-6">
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Registrations
</h3>
<div className="space-y-4">
{patients.map((p, idx) => (
<PatientCard key={p.id || idx} patient={p} />
))}
{patients.length === 0 && (
<p className="text-center text-slate-400 text-sm py-8">No recent registrations</p>
)}
</div>
</div>
</div>
</div>
)}
{view === 'appointments' && (
<div className="space-y-6">
<div className="flex items-center justify-between">
<h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
<Calendar className="w-6 h-6 text-blue-600" /> Appointment Management
</h3>
<button 
onClick={() => {
setEditingAppointment(null);
setAppointmentForm({
patientId: '', patientName: '', doctorId: '', doctorName: '',
date: format(new Date(), 'yyyy-MM-dd'), time: '09:00', reason: ''
});
setShowAppointmentModal(true);
}}
className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
>
<Plus className="w-4 h-4" /> Book Appointment
</button>
</div>
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50/50 border-b border-slate-100">
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Patient</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Doctor</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Time</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{appointments.map((appt) => (
<tr key={appt.id} className="hover:bg-slate-50/50 transition-colors">
<td className="p-4">
<p className="font-bold text-slate-900">{appt.patientName}</p>
<p className="text-[10px] text-slate-400">ID: {appt.patientId}</p>
</td>
<td className="p-4">
<p className="font-medium text-slate-700">{appt.doctorName}</p>
</td>
<td className="p-4">
<div className="flex items-center gap-2 text-slate-600">
<Calendar className="w-3 h-3" />
<span className="text-sm">{format(new Date(appt.date), 'MMM d, yyyy')}</span>
</div>
<div className="flex items-center gap-2 text-slate-400">
<Clock className="w-3 h-3" />
<span className="text-xs">{appt.time}</span>
</div>
</td>
<td className="p-4">
<p className="text-sm text-slate-600 line-clamp-1 max-w-[200px]">{appt.reason}</p>
</td>
<td className="p-4">
<span className={cn(
"px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
appt.status === 'scheduled' && "bg-blue-100 text-blue-600",
appt.status === 'completed' && "bg-green-100 text-green-600",
appt.status === 'cancelled' && "bg-red-100 text-red-600",
appt.status === 'rescheduled' && "bg-amber-100 text-amber-600"
)}>
{appt.status}
</span>
</td>
<td className="p-4 text-right">
<div className="flex items-center justify-end gap-2">
{appt.status === 'scheduled' && (
<button 
onClick={() => handleStatusChange(appt.id, 'completed')}
className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
title="Mark Completed"
>
<CheckCircle className="w-4 h-4" />
</button>
)}
<button 
onClick={() => {
setEditingAppointment(appt);
setAppointmentForm({
patientId: appt.patientId,
patientName: appt.patientName,
doctorId: appt.doctorId,
doctorName: appt.doctorName,
date: appt.date,
time: appt.time,
reason: appt.reason
});
setShowAppointmentModal(true);
}}
className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
title="Edit"
>
<Edit className="w-4 h-4" />
</button>
<button 
onClick={() => setAppointmentToDelete(appt.id)}
className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
title="Delete"
>
<Trash2 className="w-4 h-4" />
</button>
</div>
</td>
</tr>
))}
{appointments.length === 0 && (
<tr>
<td colSpan={6} className="p-12 text-center text-slate-400 italic">
No appointments found.
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
</div>
)}
{view === 'directory' && (
<div className="space-y-6">
<div className="flex items-center justify-between flex-wrap gap-4">
<h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
<UsersIcon className="w-6 h-6 text-blue-600" /> Patient Directory
</h3>
<div className="flex items-center gap-3">
<div className="relative w-72">
<Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
<input
type="text"
placeholder="Search by name or ID..."
value={searchQuery}
onChange={(e) => setSearchQuery(e.target.value)}
className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
</div>
<button
onClick={handleExportRegister}
disabled={exporting}
className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 shrink-0"
title="Download the entire patient register as a spreadsheet"
>
<Download className="w-4 h-4" /> Download Register
</button>
</div>
</div>
<div className="flex items-center gap-2 flex-wrap">
{([['all', 'All Patients'], ['fresh', 'Fresh / New'], ['old', 'Old / Existing File']] as const).map(([key, label]) => (
<button
key={key}
onClick={() => setDirectoryFilter(key)}
className={cn(
"px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors",
directoryFilter === key ? "bg-blue-600 text-white" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
)}
>
{label}
</button>
))}
<button
onClick={() => setDirectoryTodayOnly(v => !v)}
className={cn(
"px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors",
directoryTodayOnly ? "bg-emerald-600 text-white" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
)}
>
Registered Today
</button>
</div>
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50/50 border-b border-slate-100">
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Card ID</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Registered</th>
<th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{pagedDirectoryPatients
.map((p) => (
<React.Fragment key={p.cardId}>
<tr className="hover:bg-slate-50/50 transition-colors">
<td className="p-4">
<span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded-full uppercase">
{p.cardId}
</span>
</td>
<td className="p-4 font-bold text-slate-900">{p.name}</td>
<td className="p-4 text-sm text-slate-600 capitalize">{p.category}</td>
<td className="p-4">
<span className={cn(
"text-[10px] font-bold px-2 py-1 rounded-full uppercase",
p.registrationType === 'old' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
)}>
{p.registrationType === 'old' ? 'Old' : 'Fresh'}
</span>
</td>
<td className="p-4 text-sm text-slate-600">{p.phone}</td>
<td className="p-4 text-sm text-slate-600">{format(new Date(p.createdAt), 'MMM d, yyyy')}</td>
<td className="p-4 text-right">
<div className="flex items-center justify-end gap-2">
<button 
onClick={() => setExpandedPatientId(expandedPatientId === p.cardId ? null : p.cardId)}
className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
title="Quick View"
>
<UserIcon className="w-4 h-4" />
</button>
<button 
onClick={() => {
setSelectedPatientId(p.cardId);
setShowHistory(true);
}}
className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
title="Full History"
>
<History className="w-4 h-4" />
</button>
<button 
onClick={() => {
setEditingPatient(p);
setEditCardId(p.cardId);
setFormData({
name: p.name, gender: p.gender, stateOfOrigin: p.stateOfOrigin, age: p.age,
occupation: p.occupation, address: p.address, phone: p.phone, nextOfKin: p.nextOfKin,
relationship: p.relationship, nokAddress: p.nokAddress, nokPhone: p.nokPhone, category: p.category,
antenatalStatus: p.antenatalStatus || 'new'
});
setView('register');
}}
className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
title="Edit Patient"
>
<Edit className="w-4 h-4" />
</button>
<button 
onClick={() => setPatientToDelete(p.cardId)}
className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
title="Delete Patient"
>
<Trash2 className="w-4 h-4" />
</button>
</div>
</td>
</tr>
{expandedPatientId === p.cardId && (
<tr className="bg-slate-50">
<td colSpan={7} className="p-4">
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
<div>
<p className="text-slate-500 font-bold mb-1">Contact Info</p>
<p><span className="font-medium">Phone:</span> {p.phone}</p>
<p><span className="font-medium">Address:</span> {p.address}</p>
</div>
<div>
<p className="text-slate-500 font-bold mb-1">Personal Details</p>
<p><span className="font-medium">Age/Gender:</span> {p.age} / {p.gender}</p>
<p><span className="font-medium">Occupation:</span> {p.occupation}</p>
</div>
<div>
<p className="text-slate-500 font-bold mb-1">Next of Kin</p>
<p><span className="font-medium">Name:</span> {p.nextOfKin} ({p.relationship})</p>
<p><span className="font-medium">Phone:</span> {p.nokPhone}</p>
</div>
</div>
</td>
</tr>
)}
</React.Fragment>
))}
{patientsLoading && allPatients.length === 0 && (
<tr>
<td colSpan={6} className="p-12 text-center text-slate-400 italic">
Loading patients...
</td>
</tr>
)}
{!patientsLoading && patientsLoadError && allPatients.length === 0 && (
<tr>
<td colSpan={6} className="p-12 text-center text-red-400 italic">
Couldn't load the patient list. Check your connection and{' '}
<button type="button" onClick={fetchAllPatients} className="underline text-red-500">
try again
</button>.
</td>
</tr>
)}
{!patientsLoading && !patientsLoadError && allPatients.length === 0 && (
<tr>
<td colSpan={6} className="p-12 text-center text-slate-400 italic">
No patients found.
</td>
</tr>
)}
{!patientsLoading && !patientsLoadError && allPatients.length > 0 && filteredDirectoryPatients.length === 0 && (
<tr>
<td colSpan={6} className="p-12 text-center text-slate-400 italic">
No patients match your search.
</td>
</tr>
)}
</tbody>
</table>
</div>
{filteredDirectoryPatients.length > 0 && (
<div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
<span>
Showing {(directoryPage - 1) * DIRECTORY_PAGE_SIZE + 1}
{'-'}
{Math.min(directoryPage * DIRECTORY_PAGE_SIZE, filteredDirectoryPatients.length)} of {filteredDirectoryPatients.length}
</span>
<div className="flex items-center gap-2">
<button
type="button"
onClick={() => setDirectoryPage(p => Math.max(1, p - 1))}
disabled={directoryPage === 1}
className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
>
Prev
</button>
<span className="font-semibold text-slate-600">Page {directoryPage} of {directoryPageCount}</span>
<button
type="button"
onClick={() => setDirectoryPage(p => Math.min(directoryPageCount, p + 1))}
disabled={directoryPage === directoryPageCount}
className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
>
Next
</button>
</div>
</div>
)}
</div>
</div>
)}
{/* Delete Confirmation Modal */}
<AnimatePresence>
{patientToDelete && (
<div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div 
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-6"
>
<div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
<Trash2 className="w-10 h-10 text-red-600" />
</div>
<div className="space-y-2">
<h3 className="text-xl font-bold text-slate-900">Delete Patient & All Records?</h3>
<p className="text-slate-500 text-sm">
Are you sure you want to delete patient <span className="font-bold text-slate-900">{patientToDelete}</span>? 
This will permanently remove their <span className="font-bold text-red-600">profile, vitals, lab results, and billing history</span>.
</p>
</div>
<div className="flex gap-3 pt-2">
<button
onClick={() => setPatientToDelete(null)}
className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
>
Cancel
</button>
<button
onClick={() => handleDeletePatient(patientToDelete)}
disabled={loading}
className="flex-1 px-6 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50"
>
{loading ? 'Deleting...' : 'Delete Everything'}
</button>
</div>
</motion.div>
</div>
)}
</AnimatePresence>
{/* Appointment Modal */}
<AnimatePresence>
{showAppointmentModal && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div 
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
>
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<Calendar className="w-5 h-5 text-blue-600" />
{editingAppointment ? 'Edit Appointment' : 'Book New Appointment'}
</h3>
<button onClick={() => setShowAppointmentModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
<X className="w-5 h-5 text-slate-400" />
</button>
</div>
<form onSubmit={handleAppointmentSubmit} className="p-8 space-y-4">
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Patient Card ID</label>
<div className="relative">
<input
required
value={appointmentForm.patientId}
onChange={e => setAppointmentForm({ ...appointmentForm, patientId: e.target.value })}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="e.000001"
/>
<button 
type="button"
onClick={async () => {
if (!appointmentForm.patientId) return;
const { data, error } = await supabase
.from('patients')
.select('*')
.eq('card_id', appointmentForm.patientId)
.maybeSingle();
if (error) return handleSupabaseError(error, 'select', 'patients');
if (data) {
const p = patientFromRow(data);
setAppointmentForm(prev => ({ ...prev, patientName: p.name }));
toast.success(`Patient found: ${p.name}`);
} else {
toast.error('Patient not found');
}
}}
className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
>
<Search className="w-4 h-4" />
</button>
</div>
</div>
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Patient Name</label>
<input
required
value={appointmentForm.patientName}
onChange={e => setAppointmentForm({ ...appointmentForm, patientName: e.target.value })}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="Auto-filled or manual entry"
/>
</div>
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Doctor</label>
<select
required
value={appointmentForm.doctorId}
onChange={e => setAppointmentForm({ ...appointmentForm, doctorId: e.target.value })}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="">Select a Doctor</option>
{doctors.map(d => (
<option key={d.uid} value={d.uid}>{d.name}</option>
))}
</select>
</div>
<div className="grid grid-cols-2 gap-4">
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date</label>
<input
type="date"
required
value={appointmentForm.date}
onChange={e => setAppointmentForm({ ...appointmentForm, date: e.target.value })}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
</div>
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Time</label>
<input
type="time"
required
value={appointmentForm.time}
onChange={e => setAppointmentForm({ ...appointmentForm, time: e.target.value })}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
</div>
</div>
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reason for Visit</label>
<textarea
required
value={appointmentForm.reason}
onChange={e => setAppointmentForm({ ...appointmentForm, reason: e.target.value })}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
placeholder="e.g. Routine checkup, Fever, etc."
/>
</div>
<button
type="submit"
disabled={loading}
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 mt-4"
>
{loading ? 'Processing...' : (editingAppointment ? 'Update Appointment' : 'Confirm Booking')}
</button>
</form>
</motion.div>
</div>
)}
</AnimatePresence>
{/* Patient History Modal */}
<AnimatePresence>
{showHistory && selectedPatientId && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
<div className="w-full max-w-5xl my-8">
<PatientHistory 
patientId={selectedPatientId} 
onClose={() => {
setShowHistory(false);
setSelectedPatientId(null);
}} 
/>
</div>
</div>
)}
</AnimatePresence>
<ConfirmModal
isOpen={!!patientToDelete}
title="Delete Patient"
message="Are you sure you want to delete this patient and all associated records? This action cannot be undone."
confirmText="Delete"
onConfirm={() => {
if (patientToDelete) {
handleDeletePatient(patientToDelete);
}
}}
onCancel={() => setPatientToDelete(null)}
/>
<ConfirmModal
isOpen={!!appointmentToDelete}
title="Delete Appointment"
message="Are you sure you want to delete this appointment? This action cannot be undone."
confirmText="Delete"
onConfirm={() => {
if (appointmentToDelete) {
deleteAppointment(appointmentToDelete);
setAppointmentToDelete(null);
}
}}
onCancel={() => setAppointmentToDelete(null)}
/>
{/* Registration Fee Editor */}
{showFeeEditor && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="text-lg font-bold flex items-center gap-2">
<CreditCard className="w-5 h-5 text-blue-400" /> Registration Card Prices
</h3>
<button onClick={() => setShowFeeEditor(false)} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
<form onSubmit={handleSaveFees} className="p-6 space-y-4">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Single Card (₦)</label>
<input type="number" required min="0" value={feeEditorForm.single}
onChange={e => setFeeEditorForm({ ...feeEditorForm, single: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Family Card (₦)</label>
<input type="number" required min="0" value={feeEditorForm.family}
onChange={e => setFeeEditorForm({ ...feeEditorForm, family: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Antenatal — New Registration (₦)</label>
<input type="number" required min="0" value={feeEditorForm.antenatalNew}
onChange={e => setFeeEditorForm({ ...feeEditorForm, antenatalNew: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Antenatal — Returning Patient (₦)</label>
<input type="number" required min="0" value={feeEditorForm.antenatalReturning}
onChange={e => setFeeEditorForm({ ...feeEditorForm, antenatalReturning: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
</div>
<button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all">
Save Prices
</button>
</form>
</div>
</div>
)}
{/* Registration Payment */}
{pendingRegPayment && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
<h3 className="font-bold text-slate-900">Record Registration Payment</h3>
</div>
<div className="p-6 space-y-4">
<div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-xs font-bold text-slate-500">{pendingRegPayment.name}</p>
<p className="text-[10px] text-slate-400 mt-1">Card ID: {pendingRegPayment.cardId}</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Amount Paid (₦)</label>
<input
type="number"
autoFocus
value={pendingRegPayment.amount}
onChange={e => setPendingRegPayment({ ...pendingRegPayment, amount: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
placeholder="0.00"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Payment Method</label>
<div className="grid grid-cols-2 gap-3">
<button
type="button"
onClick={() => setPendingRegPayment({ ...pendingRegPayment, method: 'cash' })}
className={cn(
"flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-sm",
pendingRegPayment.method === 'cash' ? "bg-blue-50 border-blue-600 text-blue-600 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
Cash
</button>
<button
type="button"
onClick={() => setPendingRegPayment({ ...pendingRegPayment, method: 'bank transfer' })}
className={cn(
"flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-sm",
pendingRegPayment.method === 'bank transfer' ? "bg-blue-50 border-blue-600 text-blue-600 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
Transfer
</button>
</div>
</div>
<div className="flex gap-3">
<button
onClick={() => { setPendingRegPayment(null); onNavigate?.('Dashboard'); }}
className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
>
Skip for now
</button>
<button
onClick={handleConfirmRegPayment}
className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all"
>
Record Payment
</button>
</div>
</div>
</div>
</div>
)}
</div>
);
};
