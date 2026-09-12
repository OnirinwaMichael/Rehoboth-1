import React, { useState, useEffect, useMemo, memo } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { LabTest, Patient, LabTestCatalogItem } from '../types';
import { toast } from 'sonner';
import { FlaskConical, Search, CheckCircle, Clock, FileText, User, CreditCard, Save, X, LayoutDashboard, History, Beaker, CheckCircle2, Plus, Camera, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { logAction } from '../lib/audit';
import { PatientHistory } from './PatientHistory';
import { useFormDraft } from '../hooks/useFormDraft';
import { ConfirmModal } from './ConfirmModal';
import { LabReportPrint } from './LabReportPrint';
import { LabReportEditor } from './LabReportEditor';
import {
  LAB_REQUEST_FIELDS, emptyPanelResults, ComprehensivePanelResults,
} from '../data/labReportTemplates';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});
const labTestFromRow = (r: any): LabTest => ({
id: r.id, patientId: r.patient_id, recordId: r.record_id, testType: r.test_type,
price: r.price, result: r.result, structuredResults: r.structured_results,
imageUrl: r.image_url, paymentStatus: r.payment_status, createdAt: r.created_at,
reportType: r.report_type || 'legacy', requestDetails: r.request_details || undefined,
panelResults: r.panel_results || undefined,
});
interface Props {
userId: string;
}
const LabTestRow = memo(({ test, onSelect, onDelete, onPrint }: { 
test: LabTest & { patient?: Patient }, 
onSelect: (test: LabTest & { patient?: Patient }) => void,
onDelete: (id: string) => void,
onPrint: (test: LabTest & { patient?: Patient }) => void
}) => (
<tr className="hover:bg-slate-50 transition-colors group">
<td className="px-6 py-4">
<div className="flex items-center gap-3">
<div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
{test.patient?.name.charAt(0)}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{test.patient?.name}</p>
<p className="text-[10px] text-slate-400">{test.patientId}</p>
</div>
</div>
</td>
<td className="px-6 py-4">
<span className="text-sm font-semibold text-slate-700">{test.testType}</span>
</td>
<td className="px-6 py-4">
<span className={cn(
"text-[10px] font-bold px-2 py-1 rounded-full uppercase",
test.paymentStatus === 'paid' ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
)}>
{test.paymentStatus}
</span>
</td>
<td className="px-6 py-4">
{test.result ? (
<span className="flex items-center gap-1 text-green-600 text-xs font-bold">
<CheckCircle className="w-3 h-3" /> Completed
</span>
) : (
<span className="flex items-center gap-1 text-orange-500 text-xs font-bold">
<Clock className="w-3 h-3" /> Pending
</span>
)}
</td>
<td className="px-6 py-4">
<div className="flex items-center gap-2">
<button
onClick={() => onSelect(test)}
className="text-blue-600 hover:text-blue-700 font-bold text-xs"
>
{test.result ? 'Edit Result' : 'Enter Result'}
</button>
<button
onClick={() => onPrint(test)}
className="text-slate-500 hover:text-slate-700 font-bold text-xs"
>
Print
</button>
<button
onClick={() => onDelete(test.id)}
className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
title="Delete Lab Result"
>
<Trash2 className="w-4 h-4" />
</button>
</div>
</td>
</tr>
));
export const LabPortal: React.FC<Props> = ({ userId }) => {
const [tests, setTests] = useState<(LabTest & { patient?: Patient })[]>([]);
const [loading, setLoading] = useState(true);
const [selectedTest, setSelectedTest] = useState<(LabTest & { patient?: Patient }) | null>(null);
const [imageUrl, setImageUrl] = useState('');
const [showImageUpload, setShowImageUpload] = useState(false);
const [view, setView] = useState<'dashboard' | 'queue' | 'catalog' | 'manual'>('dashboard');
const { data: manualEntry, setData: setManualEntry, clearDraft: clearManualDraft } = useFormDraft('lab_manual_entry', {
patientId: '',
testType: '',
price: '',
result: '',
imageUrl: '',
reportType: 'legacy' as 'legacy' | 'basic' | 'comprehensive',
requestDetails: {} as Record<string, string>,
});
const { data: labFormRows, setData: setLabFormRows, clearDraft: clearLabRowsDraft } = useFormDraft('lab_form_rows', [
{ parameter: '', result: '', range: '', unit: '' }
]);
const { data: result, setData: setResult, clearDraft: clearResultDraft } = useFormDraft('lab_result_notes', '');
const [panelResults, setPanelResults] = useState<ComprehensivePanelResults>(emptyPanelResults());
const [activeReportType, setActiveReportType] = useState<'legacy' | 'basic' | 'comprehensive'>('legacy');
const [printTest, setPrintTest] = useState<(LabTest & { patient?: Patient }) | null>(null);
const [testCatalog, setTestCatalog] = useState<LabTestCatalogItem[]>([]);
const [manualPatientSuggestions, setManualPatientSuggestions] = useState<Patient[]>([]);
useEffect(() => {
if (!manualEntry.patientId.trim() || manualEntry.patientId.trim().length < 2) {
setManualPatientSuggestions([]);
return;
}
const timeout = setTimeout(async () => {
const { data, error } = await supabase
.from('patients')
.select('*')
.or(`name.ilike.%${manualEntry.patientId.trim()}%,card_id.ilike.%${manualEntry.patientId.trim()}%`)
.limit(8);
if (error) return handleSupabaseError(error, 'select', 'patients');
setManualPatientSuggestions((data || []).map(patientFromRow));
}, 250);
return () => clearTimeout(timeout);
}, [manualEntry.patientId]);
const [newCatalogTest, setNewCatalogTest] = useState({ name: '', price: '' });
const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
const [editingPrice, setEditingPrice] = useState('');
const fetchTestCatalog = async () => {
const { data, error } = await supabase.from('lab_test_catalog').select('*').order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'lab_test_catalog');
setTestCatalog((data || []).map((r: any) => ({
id: r.id, name: r.name, price: r.price, category: r.category, createdAt: r.created_at, updatedAt: r.updated_at,
})));
};
useEffect(() => { fetchTestCatalog(); }, []);
const handleAddCatalogTest = async (e: React.FormEvent) => {
e.preventDefault();
if (!newCatalogTest.name.trim()) {
toast.error('Enter a test name.');
return;
}
const { error } = await supabase.from('lab_test_catalog').insert({
name: newCatalogTest.name.trim(),
price: parseFloat(newCatalogTest.price) || 0,
});
if (error) return handleSupabaseError(error, 'insert', 'lab_test_catalog');
await logAction(userId, 'ADD_LAB_TEST_CATALOG', `Added ${newCatalogTest.name} to test catalog`);
toast.success('Test added to catalog!');
setNewCatalogTest({ name: '', price: '' });
fetchTestCatalog();
};
const handleUpdateCatalogPrice = async (id: string) => {
const { error } = await supabase.from('lab_test_catalog').update({ price: parseFloat(editingPrice) || 0 }).eq('id', id);
if (error) return handleSupabaseError(error, 'update', 'lab_test_catalog');
toast.success('Price updated!');
setEditingCatalogId(null);
fetchTestCatalog();
};
const updatePanelField = (section: keyof ComprehensivePanelResults, key: string, value: string) => {
setPanelResults(prev => ({ ...prev, [section]: { ...(prev[section] as any || {}), [key]: value } }));
};
const updateSensitivity = (antibiotic: string, field: 'rate' | 'result', value: string) => {
setPanelResults(prev => ({
...prev,
sensitivity: { ...(prev.sensitivity || {}), [antibiotic]: { ...(prev.sensitivity?.[antibiotic] || { rate: '', result: '' }), [field]: value } }
}));
};
const updateCultureCell = (specimen: string, finding: string, value: string) => {
setPanelResults(prev => ({
...prev,
cultureMicroscopy: {
...(prev.cultureMicroscopy || {}),
[specimen]: { ...(prev.cultureMicroscopy?.[specimen] || {}), [finding]: value }
}
}));
};
const [stats, setStats] = useState({
pending: 0,
completed: 0,
today: 0
});
const [showHistory, setShowHistory] = useState(false);
const [historyPatientId, setHistoryPatientId] = useState<string | null>(null);
const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
const pendingTests = useMemo(() => tests.filter(t => !t.result), [tests]);
const completedTests = useMemo(() => tests.filter(t => t.result), [tests]);
useEffect(() => {
fetchTests();
const channel = supabase
.channel('lab-portal-tests')
.on('postgres_changes', { event: '*', schema: 'public', table: 'lab_tests' }, () => {
fetchTests();
})
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchTests = async () => {
const { data, error } = await supabase
.from('lab_tests')
.select('*, patients(*)')
.order('created_at', { ascending: false });
if (error) {
handleSupabaseError(error, 'select', 'lab_tests');
setLoading(false);
return;
}
const testsWithPatients = (data || []).map((row: any) => ({
...labTestFromRow(row),
patient: row.patients ? patientFromRow(row.patients) : undefined,
}));
setTests(testsWithPatients);
setLoading(false);
const today = new Date().toISOString().split('T')[0];
setStats({
pending: testsWithPatients.filter(t => !t.result).length,
completed: testsWithPatients.filter(t => t.result).length,
today: testsWithPatients.filter(t => t.createdAt.startsWith(today)).length,
});
};
const handleDeleteTest = async (testId: string) => {
const { error } = await supabase.from('lab_tests').delete().eq('id', testId);
if (error) return handleSupabaseError(error, 'delete', 'lab_tests');
await logAction(userId, 'DELETE_LAB_RESULT', `Deleted lab result ${testId}`);
toast.success('Lab result deleted successfully');
};
const handleManualEntry = async (e: React.FormEvent) => {
e.preventDefault();
if (!manualEntry.patientId || !manualEntry.testType || !manualEntry.result) {
toast.error('Please fill all fields');
return;
}
try {
setLoading(true);
const { data: patientRow, error: patientErr } = await supabase
.from('patients').select('card_id').eq('card_id', manualEntry.patientId).maybeSingle();
if (patientErr) throw patientErr;
if (!patientRow) {
toast.error('Patient not found. Please check the Card ID.');
return;
}
const { error } = await supabase.from('lab_tests').insert({
patient_id: manualEntry.patientId,
test_type: manualEntry.testType,
price: parseFloat(manualEntry.price) || 0,
result: manualEntry.result,
image_url: manualEntry.imageUrl || null,
payment_status: 'pending', // Only accountant can clear payments
report_type: manualEntry.reportType,
request_details: manualEntry.reportType === 'basic' ? manualEntry.requestDetails : null,
});
if (error) throw error;
await logAction(userId, 'MANUAL_LAB_ENTRY', `Manually recorded ${manualEntry.testType} for patient ${manualEntry.patientId}`);
toast.success('Lab record added successfully!');
clearManualDraft();
setView('dashboard');
} catch (error) {
handleSupabaseError(error, 'insert', 'lab_tests');
} finally {
setLoading(false);
}
};
const handleSaveResult = async () => {
if (!selectedTest) return;
const isComprehensive = activeReportType === 'comprehensive';
const validRows = labFormRows.filter(row => row.parameter || row.result);
let finalResult = result;
if (!isComprehensive && validRows.length > 0) {
const tableHeader = "| Parameter | Result | Range | Unit |\n|---|---|---|---|\n";
const tableRows = validRows
.map(row => `| ${row.parameter} | ${row.result} | ${row.range} | ${row.unit} |`)
.join('\n');
finalResult = tableHeader + tableRows + (result ? `\n\nNotes: ${result}` : '');
}
if (!isComprehensive && !finalResult && validRows.length === 0) {
toast.error('Please enter results');
return;
}
const { error } = await supabase.from('lab_tests').update({
report_type: activeReportType,
result: finalResult || (isComprehensive ? 'See structured report' : finalResult),
structured_results: isComprehensive ? null : validRows,
panel_results: isComprehensive ? panelResults : null,
image_url: imageUrl || null,
updated_at: new Date().toISOString(),
}).eq('id', selectedTest.id);
if (error) return handleSupabaseError(error, 'update', 'lab_tests');
await logAction(userId, 'SAVE_LAB_RESULT', `Saved lab results for patient ${selectedTest.patientId}, test: ${selectedTest.testType}`);
toast.success('Lab result saved successfully!');
setSelectedTest(null);
clearResultDraft();
setImageUrl('');
setShowImageUpload(false);
clearLabRowsDraft();
setView('dashboard');
};
const addLabRow = () => {
setLabFormRows([...labFormRows, { parameter: '', result: '', range: '', unit: '' }]);
};
const updateLabRow = (index: number, field: keyof typeof labFormRows[0], value: string) => {
const newRows = [...labFormRows];
newRows[index][field] = value;
setLabFormRows(newRows);
};
const removeLabRow = (index: number) => {
if (labFormRows.length > 1) {
setLabFormRows(labFormRows.filter((_, i) => i !== index));
}
};
return (
<div className="space-y-8 max-w-7xl mx-auto">
<div className="flex items-center justify-between">
<div>
<h2 className="text-3xl font-bold text-slate-900">Laboratory Portal</h2>
<p className="text-slate-500">Manage test requests and record results.</p>
</div>
<div className="flex gap-2">
<button 
onClick={() => setView('dashboard')}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'dashboard' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<LayoutDashboard className="w-4 h-4" /> Dashboard
</button>
<button 
onClick={() => setView('queue')}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'queue' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<Clock className="w-4 h-4" /> Test Queue
</button>
<button 
onClick={() => setView('catalog')}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'catalog' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<Beaker className="w-4 h-4" /> Test Catalog
</button>
<button 
onClick={() => setView('manual')}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'manual' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<Plus className="w-4 h-4" /> Manual Entry
</button>
</div>
</div>
{view === 'dashboard' ? (
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600">
<Clock className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pending Tests</p>
<h4 className="text-3xl font-black text-slate-900">{stats.pending}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
<CheckCircle2 className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Completed</p>
<h4 className="text-3xl font-black text-slate-900">{stats.completed}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
<Beaker className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Today</p>
<h4 className="text-3xl font-black text-slate-900">{stats.today}</h4>
</div>
</div>
<div className="md:col-span-3 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Lab Activity
</h3>
<div className="space-y-4">
{tests.slice(0, 5).map((test, idx) => (
<div key={idx} className="p-4 rounded-xl border border-slate-50 bg-slate-50/50 flex justify-between items-center">
<div className="flex items-center gap-4">
<div className={cn(
"w-10 h-10 rounded-full flex items-center justify-center font-bold",
test.result ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
)}>
{test.testType.charAt(0)}
</div>
<div>
<p className="font-bold text-slate-900">{test.testType}</p>
<p className="text-xs text-slate-500">Patient: {test.patient?.name || test.patientId}</p>
</div>
</div>
<div className="text-right">
<span className={cn(
"text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
test.result ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
)}>
{test.result ? 'Completed' : 'Pending'}
</span>
<p className="text-[10px] text-slate-400 mt-1">{format(new Date(test.createdAt), 'MMM d, HH:mm')}</p>
</div>
</div>
))}
{tests.length === 0 && (
<p className="text-center text-slate-400 py-10">No lab activity recorded.</p>
)}
</div>
</div>
</div>
) : view === 'catalog' ? (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
<div className="flex items-center justify-between mb-8">
<div>
<h3 className="text-xl font-bold text-slate-900">Lab Test Catalog</h3>
<p className="text-slate-500 text-sm">Set prices here — Doctor/Nurse recommendations auto-fill from this list.</p>
</div>
<div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold text-sm">
{testCatalog.length} Tests
</div>
</div>
<form onSubmit={handleAddCatalogTest} className="flex gap-3 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
<input
value={newCatalogTest.name}
onChange={e => setNewCatalogTest({ ...newCatalogTest, name: e.target.value })}
placeholder="New test name..."
className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
/>
<input
type="number"
value={newCatalogTest.price}
onChange={e => setNewCatalogTest({ ...newCatalogTest, price: e.target.value })}
placeholder="Price (₦)"
className="w-32 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
/>
<button type="submit" className="px-5 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2">
<Plus className="w-4 h-4" /> Add
</button>
</form>
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
{testCatalog.map((test) => (
<div key={test.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between group hover:border-blue-200 transition-all">
<div className="flex items-center gap-3 min-w-0">
<div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-blue-600 shadow-sm shrink-0">
<FlaskConical className="w-4 h-4" />
</div>
<div className="min-w-0">
<p className="text-sm font-medium text-slate-700 truncate">{test.name}</p>
{editingCatalogId === test.id ? (
<div className="flex items-center gap-1 mt-1">
<input
type="number"
autoFocus
value={editingPrice}
onChange={e => setEditingPrice(e.target.value)}
onBlur={() => handleUpdateCatalogPrice(test.id)}
onKeyDown={e => e.key === 'Enter' && handleUpdateCatalogPrice(test.id)}
className="w-24 p-1 text-xs border border-blue-300 rounded outline-none"
/>
</div>
) : (
<button
onClick={() => { setEditingCatalogId(test.id); setEditingPrice(test.price.toString()); }}
className="text-xs font-bold text-blue-600 hover:underline mt-0.5"
>
₦{test.price.toLocaleString()} · edit
</button>
)}
</div>
</div>
</div>
))}
</div>
</div>
) : view === 'manual' ? (
<div className="max-w-2xl mx-auto">
<form onSubmit={handleManualEntry} className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center gap-2">
<Plus className="w-5 h-5 text-blue-400" />
<h3 className="font-bold">Manual Lab Entry</h3>
</div>
<div className="p-8 space-y-6">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Patient</label>
<div className="relative">
<User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
<input
value={manualEntry.patientId}
onChange={e => setManualEntry({ ...manualEntry, patientId: e.target.value })}
className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="Search by name or Card ID"
/>
{manualPatientSuggestions.length > 0 && (
<div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
{manualPatientSuggestions.map(p => (
<button
key={p.cardId}
type="button"
onClick={() => { setManualEntry({ ...manualEntry, patientId: p.cardId }); setManualPatientSuggestions([]); }}
className="w-full flex items-center justify-between text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
>
<div className="min-w-0">
<p className="font-bold text-slate-900 truncate">{p.name}</p>
<p className="text-[10px] text-slate-400">{p.age} · {p.gender}</p>
</div>
<span className="text-xs font-bold text-blue-600 shrink-0 ml-2">{p.cardId}</span>
</button>
))}
</div>
)}
</div>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Test / Scan Type</label>
<select
value={manualEntry.testType}
onChange={e => {
const picked = testCatalog.find(t => t.name === e.target.value);
setManualEntry({
...manualEntry,
testType: e.target.value,
price: picked ? picked.price.toString() : manualEntry.price,
});
}}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="">Select a test...</option>
{testCatalog.map((test) => (
<option key={test.id} value={test.name}>{test.name} — ₦{test.price.toLocaleString()}</option>
))}
</select>
<p className="text-[10px] text-slate-400">Price auto-fills from the catalog — you can still adjust it below for this specific entry.</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Report Template</label>
<select
value={manualEntry.reportType}
onChange={e => setManualEntry({ ...manualEntry, reportType: e.target.value as 'legacy' | 'basic' | 'comprehensive' })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="legacy">Free-form (legacy)</option>
<option value="basic">Basic Lab Request Form</option>
<option value="comprehensive">Comprehensive Lab Report</option>
</select>
{manualEntry.reportType === 'comprehensive' && (
<p className="text-xs text-slate-500">Structured panels are filled after creation, from the Test Queue → Enter Result.</p>
)}
</div>
{manualEntry.reportType === 'basic' && (
<div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
<p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lab Request Details</p>
{LAB_REQUEST_FIELDS.map(f => (
<div key={f.key}>
<label className="text-[10px] font-bold text-slate-500">{f.label}</label>
<input
value={manualEntry.requestDetails[f.key] || ''}
onChange={e => setManualEntry({ ...manualEntry, requestDetails: { ...manualEntry.requestDetails, [f.key]: e.target.value } })}
className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
/>
</div>
))}
</div>
)}
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Price (₦)</label>
<input
type="number"
value={manualEntry.price}
onChange={e => setManualEntry({ ...manualEntry, price: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="Enter price"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Result / Observations</label>
<textarea
value={manualEntry.result}
onChange={e => setManualEntry({ ...manualEntry, result: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[150px]"
placeholder="Enter test results and patient information..."
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
setManualEntry({ ...manualEntry, imageUrl: reader.result as string });
};
reader.readAsDataURL(file);
}
}}
/>
</label>
</div>
)}
{manualEntry.imageUrl && (
<div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200">
<img src={manualEntry.imageUrl} alt="Attachment" className="w-full h-full object-cover" />
<button
type="button"
onClick={() => setManualEntry({ ...manualEntry, imageUrl: '' })}
className="absolute top-2 right-2 p-1 bg-white rounded-full text-red-500 hover:bg-red-50"
>
<X className="w-4 h-4" />
</button>
</div>
)}
</div>
<button
type="submit"
disabled={loading}
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
>
<Save className="w-5 h-5" />
{loading ? 'Adding Record...' : 'Add Lab Record'}
</button>
</div>
</form>
</div>
) : (
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
{/* Test Queue */}
<div className="lg:col-span-8 space-y-6">
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<FlaskConical className="w-5 h-5 text-purple-600" /> Test Queue
</h3>
<div className="flex gap-4 text-xs font-bold uppercase tracking-wider">
<span className="flex items-center gap-1 text-orange-500"><Clock className="w-3 h-3" /> Pending</span>
<span className="flex items-center gap-1 text-green-500"><CheckCircle className="w-3 h-3" /> Completed</span>
</div>
</div>
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Patient</th>
<th className="px-6 py-4">Test Type</th>
<th className="px-6 py-4">Payment</th>
<th className="px-6 py-4">Status</th>
<th className="px-6 py-4">Action</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{tests.map((test, idx) => (
<LabTestRow 
key={test.id || idx} 
test={test} 
onDelete={(id) => setDeleteConfirmId(id)}
onPrint={(t) => setPrintTest(t)}
onSelect={(t) => {
setSelectedTest(t);
setActiveReportType(t.reportType || 'legacy');
setResult(t.reportType === 'comprehensive' ? '' : (t.result || ''));
if (t.structuredResults && t.structuredResults.length > 0) {
setLabFormRows(t.structuredResults);
} else {
setLabFormRows([{ parameter: '', result: '', range: '', unit: '' }]);
}
setPanelResults(t.panelResults && Object.keys(t.panelResults).length > 0 ? t.panelResults : emptyPanelResults());
}}
/>
))}
{tests.length === 0 && !loading && (
<tr>
<td colSpan={5} className="px-6 py-20 text-center text-slate-400">
No test requests found.
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
</div>
{/* Result Entry Panel */}
<div className="lg:col-span-4">
<AnimatePresence mode="wait">
{selectedTest ? (
<motion.div
initial={{ opacity: 0, x: 20 }}
animate={{ opacity: 1, x: 0 }}
exit={{ opacity: 0, x: 20 }}
className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden sticky top-8"
>
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="font-bold flex items-center gap-2">
<FileText className="w-5 h-5 text-blue-400" /> Record Result
</h3>
<div className="flex items-center gap-1">
<button
onClick={() => setPrintTest(selectedTest)}
className="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 rounded-lg"
title="Preview / Print Report"
>
Print
</button>
<button onClick={() => setSelectedTest(null)} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
</div>
<div className="p-6 space-y-6">
<div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Patient Details</p>
<div className="flex justify-between items-center">
<div>
<p className="font-bold text-slate-900">{selectedTest.patient?.name}</p>
<p className="text-xs text-slate-500">Test: <span className="text-blue-600 font-bold">{selectedTest.testType}</span></p>
</div>
<button 
onClick={() => {
setHistoryPatientId(selectedTest.patientId);
setShowHistory(true);
}}
className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 transition-colors"
title="View Patient History"
>
<History className="w-4 h-4" />
</button>
</div>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Report Form Type</label>
<select
value={activeReportType}
onChange={e => setActiveReportType(e.target.value as 'legacy' | 'basic' | 'comprehensive')}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="legacy">Free-form (legacy grid)</option>
<option value="basic">Basic Lab Request Form</option>
<option value="comprehensive">Comprehensive Lab Report</option>
</select>
<p className="text-[10px] text-slate-400">Pick whichever template matches this test — this can be changed regardless of how the test was requested.</p>
</div>
<div className="space-y-4">
{activeReportType === 'comprehensive' ? (
<div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
<LabReportEditor
test={selectedTest}
panelResults={panelResults}
onUpdatePanelField={updatePanelField}
onUpdateSensitivity={updateSensitivity}
onUpdateCultureCell={updateCultureCell}
notes={result}
onNotesChange={setResult}
/>
</div>
) : (
<>
<div className="flex items-center justify-between">
<label className="text-sm font-bold text-slate-700">Standard Lab Form (Grid)</label>
<button 
onClick={addLabRow}
className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
>
<Plus className="w-3 h-3" /> Add Parameter
</button>
</div>
<div className="border border-slate-200 rounded-xl overflow-hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
<th className="px-3 py-2">Parameter</th>
<th className="px-3 py-2">Result</th>
<th className="px-3 py-2">Range</th>
<th className="px-3 py-2">Unit</th>
<th className="px-3 py-2 w-8"></th>
</tr>
</thead>
<tbody className="divide-y divide-slate-100">
{labFormRows.map((row, idx) => (
<tr key={idx}>
<td className="px-2 py-1">
<input 
value={row.parameter}
onChange={e => updateLabRow(idx, 'parameter', e.target.value)}
className="w-full p-1 text-xs border-none focus:ring-1 focus:ring-blue-500 rounded outline-none"
placeholder="e.g. WBC"
/>
</td>
<td className="px-2 py-1">
<input 
value={row.result}
onChange={e => updateLabRow(idx, 'result', e.target.value)}
className="w-full p-1 text-xs border-none focus:ring-1 focus:ring-blue-500 rounded outline-none"
placeholder="Value"
/>
</td>
<td className="px-2 py-1">
<input 
value={row.range}
onChange={e => updateLabRow(idx, 'range', e.target.value)}
className="w-full p-1 text-xs border-none focus:ring-1 focus:ring-blue-500 rounded outline-none"
placeholder="Range"
/>
</td>
<td className="px-2 py-1">
<input 
value={row.unit}
onChange={e => updateLabRow(idx, 'unit', e.target.value)}
className="w-full p-1 text-xs border-none focus:ring-1 focus:ring-blue-500 rounded outline-none"
placeholder="Unit"
/>
</td>
<td className="px-2 py-1">
<button 
onClick={() => removeLabRow(idx)}
className="text-slate-300 hover:text-red-500 transition-colors"
>
<X className="w-3 h-3" />
</button>
</td>
</tr>
))}
</tbody>
</table>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Additional Observations</label>
<textarea
value={result}
onChange={e => setResult(e.target.value)}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
placeholder="Enter any additional notes..."
/>
</div>
</>
)}
<div className="space-y-4 border-t border-slate-100 pt-4">
<div className="flex items-center justify-between">
<label className="text-sm font-bold text-slate-700 flex items-center gap-2">
<Plus className="w-4 h-4" /> Attach Image (Optional)
</label>
<button
type="button"
onClick={() => setShowImageUpload(!showImageUpload)}
className="text-xs font-bold text-blue-600 hover:text-blue-800"
>
{showImageUpload ? 'Cancel Upload' : 'Add Image (Lab Result)'}
</button>
</div>
{showImageUpload && (
<div className="flex items-center justify-center w-full">
<label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
<div className="flex flex-col items-center justify-center pt-5 pb-6">
<Plus className="w-8 h-8 text-slate-400 mb-2" />
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
setImageUrl(reader.result as string);
};
reader.readAsDataURL(file);
}
}}
/>
</label>
</div>
)}
{imageUrl && (
<div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200">
<img src={imageUrl} alt="Attachment" className="w-full h-full object-cover" />
<button
type="button"
onClick={() => setImageUrl('')}
className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
>
<X className="w-4 h-4" />
</button>
</div>
)}
</div>
</div>
<div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-100 rounded-xl">
<CreditCard className="w-5 h-5 text-orange-500" />
<div className="text-xs">
<p className="font-bold text-orange-700 uppercase">Payment Status</p>
<p className="text-orange-600">This test is <span className="font-bold">{selectedTest.paymentStatus}</span></p>
</div>
</div>
<button
onClick={handleSaveResult}
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
>
<Save className="w-5 h-5" />
Save Result
</button>
</div>
</motion.div>
) : (
<div className="bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center h-[400px]">
<FlaskConical className="w-12 h-12 text-slate-300 mb-4" />
<p className="text-slate-400 font-medium">Select a test from the queue to record results.</p>
</div>
)}
</AnimatePresence>
</div>
</div>
)}
{/* Patient History Modal */}
<AnimatePresence>
{showHistory && historyPatientId && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
<div className="w-full max-w-5xl my-8">
<PatientHistory 
patientId={historyPatientId} 
onClose={() => {
setShowHistory(false);
setHistoryPatientId(null);
}} 
/>
</div>
</div>
)}
</AnimatePresence>
<ConfirmModal
isOpen={!!deleteConfirmId}
title="Delete Lab Result"
message="Are you sure you want to delete this lab result? This action cannot be undone."
confirmText="Delete"
onConfirm={() => {
if (deleteConfirmId) {
handleDeleteTest(deleteConfirmId);
setDeleteConfirmId(null);
}
}}
onCancel={() => setDeleteConfirmId(null)}
/>
{printTest && (
<LabReportPrint test={printTest} onClose={() => setPrintTest(null)} />
)}
</div>
);
};
