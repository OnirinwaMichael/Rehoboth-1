import React, { useState, useEffect, useMemo, memo } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { LabTest, Patient, LabTestCatalogItem, LabResource, WardCatalogItem, FamilyMember, LabRequestDetails } from '../types';
import { toast } from 'sonner';
import { FlaskConical, Search, CheckCircle, Clock, FileText, User, CreditCard, Save, X, LayoutDashboard, History, Beaker, CheckCircle2, Plus, Camera, Trash2, Package, Users as UsersIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import SearchSelect from './SearchSelect';
import { motion, AnimatePresence } from 'motion/react';
import { logAction } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { PatientHistory } from './PatientHistory';
import { useFormDraft } from '../hooks/useFormDraft';
import { ConfirmModal } from './ConfirmModal';
import { LabReportPrint } from './LabReportPrint';
import { LabGroupEntryPanel, LabTestX, isLabTestLocked } from './LabGroupEntryPanel';
import { paymentRecorded } from '../lib/paymentGate';
import { WalkInPatientDialog } from './WalkInPatientDialog';
import { LabRequestFormPaper } from './LabRequestFormPaper';
import { buildPaperValues, toRequestDetails, PaperValues } from '../lib/labRequestForm';
import { LabResultFormSheet } from './LabResultFormSheet';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});
const labTestFromRow = (r: any): LabTest => ({
id: r.id, patientId: r.patient_id, recordId: r.record_id, familyMemberId: r.family_member_id ?? null, testType: r.test_type,
price: r.price, result: r.result, structuredResults: r.structured_results,
imageUrl: r.image_url, paymentStatus: r.payment_status, createdAt: r.created_at,
reportType: r.report_type || 'legacy', requestDetails: r.request_details || undefined,
panelResults: r.panel_results || undefined,
});
interface Props {
userId: string;
}
interface LabGroup { key: string; tests: LabTestX[] }
const paymentChip = (label: string, tone: 'green' | 'orange' | 'slate' | 'blue') => (
<span className={cn(
"text-[11px] font-bold px-2 py-1 rounded-full uppercase whitespace-nowrap",
tone === 'green' ? "bg-green-100 text-green-600" : tone === 'orange' ? "bg-orange-100 text-orange-600" : tone === 'blue' ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
)}>{label}</span>
);
const LabGroupRow = memo(({ group, onOpen, onDelete, onPrint }: {
group: LabGroup,
onOpen: () => void,
onDelete: (id: string) => void,
onPrint: (tests: LabTestX[]) => void,
}) => {
const [expanded, setExpanded] = useState(false);
const { tests } = group;
const first = tests[0];
const multi = tests.length > 1;
const done = tests.filter(t => !!t.result).length;
const billable = tests.filter(t => (Number(t.price) || 0) > 0);
const unpaid = billable.filter(t => t.paymentStatus !== 'paid').length;
const awaiting = billable.filter(t => !paymentRecorded(t.paymentStatus)).length;
const payment = billable.length === 0
? paymentChip('no charge', 'slate')
: unpaid === 0
? paymentChip('paid', 'green')
: awaiting === 0
? paymentChip('part paid · balance owing', 'blue')
: !multi
? paymentChip(first.paymentStatus, 'orange')
: paymentChip(awaiting === billable.length ? 'pending' : `${awaiting} of ${billable.length} unpaid`, 'orange');
const statusDone = (
<span className="flex items-center gap-1 text-green-600 text-xs font-bold"><CheckCircle className="w-3 h-3" /> Completed</span>
);
const statusPending = (label: string) => (
<span className="flex items-center gap-1 text-orange-500 text-xs font-bold"><Clock className="w-3 h-3" /> {label}</span>
);
return (
<>
<tr className="hover:bg-slate-50 transition-colors group">
<td className="px-6 py-4">
<div className="flex items-center gap-3">
<div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
{first.patient?.name.charAt(0)}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{first.patient?.name}</p>
<p className="text-[11px] text-slate-400">{first.patientId}</p>
{first.familyMemberName && <p className="text-[11px] font-bold text-amber-700">For: {first.familyMemberName}</p>}
</div>
</div>
</td>
<td className="px-6 py-4">
{multi ? (
<div className="flex flex-wrap gap-1 max-w-xs">
{tests.map(t => (
<span key={t.id} className={cn(
"text-xs font-semibold px-2 py-0.5 rounded-full",
t.result ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-700"
)}>{t.testType}</span>
))}
</div>
) : (
<span className="text-sm font-semibold text-slate-700">{first.testType}</span>
)}
</td>
<td className="px-6 py-4">{payment}</td>
<td className="px-6 py-4">
{done === tests.length ? statusDone : multi && done > 0 ? statusPending(`${done} of ${tests.length} done`) : statusPending('Pending')}
</td>
<td className="px-6 py-4">
<div className="flex items-center gap-2">
<button onClick={onOpen} className="text-blue-600 hover:text-blue-700 font-bold text-xs whitespace-nowrap">
{done === tests.length ? 'Edit Results' : multi ? 'Enter Results' : 'Enter Result'}
</button>
<button onClick={() => onPrint(tests)} className="text-slate-500 hover:text-slate-700 font-bold text-xs">
Print
</button>
{multi ? (
<button
onClick={() => setExpanded(e => !e)}
className="text-slate-500 hover:text-slate-700 font-bold text-xs whitespace-nowrap"
>
{expanded ? 'Hide' : `${tests.length} tests`}
</button>
) : (
<button
onClick={() => onDelete(first.id)}
className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
title="Delete Lab Result"
>
<Trash2 className="w-4 h-4" />
</button>
)}
</div>
</td>
</tr>
{multi && expanded && tests.map(t => (
<tr key={t.id} className="bg-slate-50/60">
<td className="px-6 py-2" />
<td className="px-6 py-2 text-xs font-semibold text-slate-700">{t.testType}</td>
<td className="px-6 py-2">
{(Number(t.price) || 0) > 0
? paymentChip(t.paymentStatus === 'partial' ? 'part paid' : t.paymentStatus, t.paymentStatus === 'paid' ? 'green' : t.paymentStatus === 'partial' ? 'blue' : 'orange')
: paymentChip('no charge', 'slate')}
</td>
<td className="px-6 py-2">{t.result ? statusDone : isLabTestLocked(t) ? statusPending('Awaiting payment') : statusPending('Pending')}</td>
<td className="px-6 py-2">
<button
onClick={() => onDelete(t.id)}
className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
title="Delete Lab Result"
>
<Trash2 className="w-4 h-4" />
</button>
</td>
</tr>
))}
</>
);
});
export const LabPortal: React.FC<Props> = ({ userId }) => {
const { user } = useAuth();
const [tests, setTests] = useState<(LabTest & { patient?: Patient })[]>([]);
const [loading, setLoading] = useState(true);
const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
const [showImageUpload, setShowImageUpload] = useState(false);
const [view, setView] = useState<'dashboard' | 'queue' | 'catalog' | 'manual' | 'resources'>('dashboard');
const [showResultForm, setShowResultForm] = useState(false);
const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
const { data: manualEntry, setData: setManualEntry, clearDraft: clearManualDraft } = useFormDraft('lab_manual_entry', {
patientId: '',
testType: '',
price: '',
result: '',
imageUrl: '',
reportType: 'basic' as 'basic' | 'comprehensive',
requestDetails: {} as Record<string, string>,
});
const [printTests, setPrintTests] = useState<LabTestX[] | null>(null);
const [testCatalog, setTestCatalog] = useState<LabTestCatalogItem[]>([]);
const [catalogSearch, setCatalogSearch] = useState('');
const filteredTestCatalog = useMemo(() => {
const q = catalogSearch.trim().toLowerCase();
if (!q) return testCatalog;
return testCatalog.filter(test => test.name.toLowerCase().includes(q));
}, [testCatalog, catalogSearch]);
const [manualPatientSuggestions, setManualPatientSuggestions] = useState<Patient[]>([]);
const [showWalkIn, setShowWalkIn] = useState(false);
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
const [manualFamilyMembers, setManualFamilyMembers] = useState<FamilyMember[]>([]);
const [manualFamilyMemberId, setManualFamilyMemberId] = useState('');
const [testTypeOpen, setTestTypeOpen] = useState(false);
useEffect(() => {
const cardId = manualEntry.patientId.trim();
if (!cardId) { setManualFamilyMembers([]); setManualFamilyMemberId(''); return; }
const timeout = setTimeout(async () => {
const { data: patientRow, error: patientErr } = await supabase
.from('patients').select('card_id, category').eq('card_id', cardId).maybeSingle();
if (patientErr) return handleSupabaseError(patientErr, 'select', 'patients');
setManualFamilyMemberId('');
if (!patientRow || patientRow.category !== 'family card') { setManualFamilyMembers([]); return; }
const { data: membersData, error: membersErr } = await supabase
.from('family_members').select('*').eq('patient_id', cardId)
.order('sort_order', { ascending: true }).order('created_at', { ascending: true });
if (membersErr) return handleSupabaseError(membersErr, 'select', 'family_members');
setManualFamilyMembers((membersData || []).map((m: any) => ({
id: m.id, patientId: m.patient_id, name: m.name, sortOrder: m.sort_order, createdAt: m.created_at
})));
}, 300);
return () => clearTimeout(timeout);
}, [manualEntry.patientId]);
const [newCatalogTest, setNewCatalogTest] = useState({ name: '', price: '' });
const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
const [editingPrice, setEditingPrice] = useState('');
const [deletingCatalogTest, setDeletingCatalogTest] = useState<LabTestCatalogItem | null>(null);
const fetchTestCatalog = async () => {
const { data, error } = await supabase.from('lab_test_catalog').select('*').order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'lab_test_catalog');
setTestCatalog((data || []).map((r: any) => ({
id: r.id, name: r.name, price: r.price, category: r.category, createdAt: r.created_at, updatedAt: r.updated_at,
linkedResourceId: r.linked_resource_id, resourceQtyPerTest: r.resource_qty_per_test ?? 1,
})));
};
useEffect(() => { fetchTestCatalog(); }, []);
// --- Ward list (editable, CMD-managed) & Consultants (pulled from real staff records) ---
const [wardCatalog, setWardCatalog] = useState<WardCatalogItem[]>([]);
const [consultants, setConsultants] = useState<{ id: string; name: string }[]>([]);
const [newWardName, setNewWardName] = useState('');
const [addingWard, setAddingWard] = useState(false);
const fetchWardCatalog = async () => {
const { data, error } = await supabase.from('ward_catalog').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'ward_catalog');
setWardCatalog((data || []).map((r: any) => ({ id: r.id, name: r.name, sortOrder: r.sort_order, createdAt: r.created_at })));
};
const fetchConsultants = async () => {
const { data, error } = await supabase.from('users').select('id,name').in('role', ['CMD', 'Doctor']).eq('status', 'active').order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'users');
setConsultants(data || []);
};
useEffect(() => { fetchWardCatalog(); fetchConsultants(); }, []);
const handleAddWard = async (name: string) => {
const trimmed = name.trim();
if (!trimmed) return;
setAddingWard(true);
const { error } = await supabase.from('ward_catalog').insert({ name: trimmed, sort_order: wardCatalog.length });
setAddingWard(false);
if (error) return handleSupabaseError(error, 'insert', 'ward_catalog');
setNewWardName('');
fetchWardCatalog();
};
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
const handleDeleteCatalogTest = async () => {
if (!deletingCatalogTest) return;
const { error } = await supabase.from('lab_test_catalog').delete().eq('id', deletingCatalogTest.id);
if (error) return handleSupabaseError(error, 'delete', 'lab_test_catalog');
await logAction(userId, 'DELETE_LAB_TEST_CATALOG', `Removed ${deletingCatalogTest.name} from test catalog`);
toast.success('Test removed from catalog.');
setDeletingCatalogTest(null);
fetchTestCatalog();
};
const handleLinkCatalogResource = async (testId: string, resourceId: string, qty: number) => {
const { error } = await supabase.from('lab_test_catalog').update({
linked_resource_id: resourceId || null,
resource_qty_per_test: qty || 1,
}).eq('id', testId);
if (error) return handleSupabaseError(error, 'update', 'lab_test_catalog');
toast.success('Resource link updated!');
fetchTestCatalog();
};
// --- Lab resources (consumables: strips, reagents, swabs, etc.) ---
const [resources, setResources] = useState<LabResource[]>([]);
const [resourceSearch, setResourceSearch] = useState('');
const filteredResources = useMemo(() => {
const q = resourceSearch.trim().toLowerCase();
if (!q) return resources;
return resources.filter(r => r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q));
}, [resources, resourceSearch]);
const [isAddingResource, setIsAddingResource] = useState(false);
const [editingResource, setEditingResource] = useState<LabResource | null>(null);
const [deletingResource, setDeletingResource] = useState<LabResource | null>(null);
const [resourceForm, setResourceForm] = useState({ name: '', unit: 'strips', stock: '', lowStockThreshold: '10' });
const fetchResources = async () => {
const { data, error } = await supabase.from('lab_resources').select('*').order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'lab_resources');
setResources((data || []).map((r: any) => ({
id: r.id, name: r.name, unit: r.unit, stock: r.stock, lowStockThreshold: r.low_stock_threshold,
category: r.category, createdAt: r.created_at, updatedAt: r.updated_at,
})));
};
useEffect(() => { fetchResources(); }, []);
useEffect(() => {
const channel = supabase
.channel('lab-portal-resources')
.on('postgres_changes', { event: '*', schema: 'public', table: 'lab_resources' }, () => {
fetchResources();
})
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const handleSaveResource = async (e: React.FormEvent) => {
e.preventDefault();
if (!resourceForm.name.trim()) { toast.error('Enter a resource name.'); return; }
const resourceData = {
name: resourceForm.name.trim(),
unit: resourceForm.unit.trim() || 'units',
stock: parseInt(resourceForm.stock, 10) || 0,
low_stock_threshold: parseInt(resourceForm.lowStockThreshold, 10) || 10,
};
try {
if (editingResource) {
const { error } = await supabase.from('lab_resources').update(resourceData).eq('id', editingResource.id);
if (error) throw error;
await logAction(userId, 'UPDATE_LAB_RESOURCE', `Updated lab resource: ${resourceData.name}`);
toast.success('Resource updated!');
} else {
const { error } = await supabase.from('lab_resources').insert(resourceData);
if (error) throw error;
await logAction(userId, 'ADD_LAB_RESOURCE', `Added lab resource: ${resourceData.name}`);
toast.success('Resource added!');
}
setResourceForm({ name: '', unit: 'strips', stock: '', lowStockThreshold: '10' });
setIsAddingResource(false);
setEditingResource(null);
fetchResources();
} catch (error) {
handleSupabaseError(error, editingResource ? 'update' : 'insert', 'lab_resources');
}
};
const handleDeleteResource = async () => {
if (!deletingResource) return;
const { error } = await supabase.from('lab_resources').delete().eq('id', deletingResource.id);
if (error) return handleSupabaseError(error, 'delete', 'lab_resources');
await logAction(userId, 'DELETE_LAB_RESOURCE', `Deleted lab resource: ${deletingResource.name}`);
toast.success('Resource deleted.');
setDeletingResource(null);
fetchResources();
};
const [stats, setStats] = useState({
pending: 0,
completed: 0,
today: 0
});
const [showHistory, setShowHistory] = useState(false);
const [historyPatientId, setHistoryPatientId] = useState<string | null>(null);
const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
// One queue row per patient request: every test the doctor recommended in the
// same consultation sits together. Walk-in entries have no consultation, so
// each stays on its own row.
const groups = useMemo(() => {
const map = new Map<string, LabTestX[]>();
const order: string[] = [];
tests.forEach(t => {
const key = t.recordId ? `${t.recordId}|${t.familyMemberId || ''}` : `solo|${t.id}`;
if (!map.has(key)) { map.set(key, []); order.push(key); }
map.get(key)!.push(t);
});
return order.map(key => ({
key,
tests: map.get(key)!.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
}));
}, [tests]);
const queueGroups = useMemo(() => {
if (queueStatusFilter === 'pending') return groups.filter(g => g.tests.some(t => !t.result));
if (queueStatusFilter === 'completed') return groups.filter(g => g.tests.every(t => !!t.result));
return groups;
}, [queueStatusFilter, groups]);
const selectedGroup = useMemo(() => groups.find(g => g.key === selectedGroupKey) || null, [groups, selectedGroupKey]);
// Real trend data for the Total Today sparkline — derived from `tests`,
// which is already the full, uncapped lab_tests list (fetchTests has no
// .limit()), so no extra query is needed.
const last7DaysTests = useMemo(() => {
const days: { label: string; count: number }[] = [];
for (let i = 6; i >= 0; i--) {
const d = new Date();
d.setDate(d.getDate() - i);
const key = format(d, 'yyyy-MM-dd');
days.push({ label: format(d, 'EEE'), count: tests.filter(t => t.createdAt.startsWith(key)).length });
}
return days;
}, [tests]);
const testsTrendPct = useMemo(() => {
const today = last7DaysTests[6]?.count ?? 0;
const yesterday = last7DaysTests[5]?.count ?? 0;
if (yesterday === 0) return today > 0 ? 100 : 0;
return Math.round(((today - yesterday) / yesterday) * 100);
}, [last7DaysTests]);
// Real breakdown by test type — top 5 by volume, with everything else
// genuinely summed into "Other" rather than dropped or invented.
const testsByType = useMemo(() => {
const counts: Record<string, number> = {};
tests.forEach(t => { counts[t.testType] = (counts[t.testType] || 0) + 1; });
const total = tests.length || 1;
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
const top = sorted.slice(0, 5);
const rest = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
const rows = top.map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }));
if (rest > 0) rows.push({ label: 'Other', count: rest, pct: Math.round((rest / total) * 100) });
return rows;
}, [tests]);
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
const { data: famData } = await supabase.from('family_members').select('id, name');
const famNames: Record<string, string> = {};
(famData || []).forEach((m: any) => { famNames[m.id] = m.name; });
const testsWithPatients = (data || []).map((row: any) => ({
...labTestFromRow(row),
familyMemberName: row.family_member_id ? famNames[row.family_member_id] : undefined,
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
const manualType: 'basic' | 'comprehensive' = manualEntry.reportType === 'comprehensive' ? 'comprehensive' : 'basic';
const manualPaper: PaperValues = buildPaperValues({
testType: manualEntry.testType,
result: manualEntry.result,
requestDetails: manualEntry.requestDetails as LabRequestDetails,
familyMemberName: manualFamilyMembers.find(m => m.id === manualFamilyMemberId)?.name,
patient: manualPatientSuggestions.find(p => p.cardId.toLowerCase() === manualEntry.patientId.trim().toLowerCase()),
});
const handleManualPaperChange = (p: Partial<PaperValues>) => {
const { labResult, ...rest } = p;
setManualEntry({
...manualEntry,
...(labResult !== undefined ? { result: labResult } : {}),
requestDetails: { ...manualEntry.requestDetails, ...rest },
});
};
const handleManualEntry = async (e: React.FormEvent) => {
e.preventDefault();
const manualPrice = parseFloat(manualEntry.price) || 0;
const manualHasResult = !!(manualEntry.result || '').trim();
// A priced test is saved as a request first; its result is entered from the Test Queue
// once the receptionist has recorded a payment (full or part). Free tests keep the old flow.
if (!manualEntry.patientId || !manualEntry.testType || (manualPrice === 0 && !manualHasResult)) {
toast.error('Please fill all fields');
return;
}
if (manualPrice > 0 && manualHasResult) {
toast.error('This test has a price, so its result can only be entered after the receptionist records payment. Clear the result, save the request, then enter it from the Test Queue.');
return;
}
if (!testCatalog.some(t => t.name === manualEntry.testType)) {
toast.error('Please pick the test from the search list.');
return;
}
if (manualFamilyMembers.length > 0 && !manualFamilyMemberId) {
toast.error('Please select which family member this test is for.');
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
let manualLabNo = '';
if (manualType === 'basic') {
const { data: no, error: noErr } = await supabase.rpc('next_lab_no');
if (noErr || !no || typeof no !== 'string') {
console.error('[next_lab_no]', noErr?.message);
toast.error('Could not generate a Lab No. Check your connection and try again.');
return;
}
manualLabNo = no;
}
const { error } = await supabase.from('lab_tests').insert({
patient_id: manualEntry.patientId,
family_member_id: manualFamilyMemberId || null,
test_type: manualEntry.testType,
price: parseFloat(manualEntry.price) || 0,
result: manualPrice > 0 ? null : manualEntry.result,
image_url: manualEntry.imageUrl || null,
payment_status: 'pending', // Only accountant can clear payments
report_type: manualType,
request_details: manualType === 'basic' ? toRequestDetails({ ...manualPaper, labNo: manualLabNo }) : null,
});
if (error) throw error;
await logAction(userId, 'MANUAL_LAB_ENTRY', `Manually recorded ${manualEntry.testType} for patient ${manualEntry.patientId}`);
toast.success(manualPrice > 0 ? 'Request saved. Enter the result from the Test Queue once payment is recorded.' : 'Lab record added successfully!');
clearManualDraft();
setManualFamilyMemberId('');
setManualFamilyMembers([]);
setView('dashboard');
} catch (error) {
handleSupabaseError(error, 'insert', 'lab_tests');
} finally {
setLoading(false);
}
};
return (
<div className="space-y-8 max-w-7xl mx-auto">
{showResultForm && <LabResultFormSheet userId={userId} onClose={() => setShowResultForm(false)} />}
{showWalkIn && (
<WalkInPatientDialog
userId={userId}
onClose={() => setShowWalkIn(false)}
onCreated={(cardId) => { setManualEntry({ ...manualEntry, patientId: cardId }); setManualPatientSuggestions([]); setShowWalkIn(false); }}
/>
)}
{selectedGroup && (
<LabGroupEntryPanel
key={selectedGroup.key}
tests={selectedGroup.tests}
userId={userId}
wards={wardCatalog.map(w => w.name)}
consultants={consultants.map(c => c.name)}
onAddWard={handleAddWard}
onClose={() => setSelectedGroupKey(null)}
onSaved={() => { fetchTests(); }}
onShowHistory={(pid) => { setHistoryPatientId(pid); setShowHistory(true); }}
onPrint={(list) => setPrintTests(list)}
/>
)}
<div className="flex items-center justify-between">
<div>
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
onClick={() => { setQueueStatusFilter('all'); setView('queue'); }}
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
onClick={() => setView('resources')}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'resources' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<Package className="w-4 h-4" /> Resources
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
<button
onClick={() => setShowResultForm(true)}
className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all bg-white text-sky-700 border border-sky-200 hover:bg-sky-50"
>
<FileText className="w-4 h-4" /> Lab Results
</button>
</div>
</div>
{view === 'dashboard' ? (
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
<button
type="button"
onClick={() => { setQueueStatusFilter('pending'); setView('queue'); }}
className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6 text-left hover:border-orange-200 hover:shadow-md transition-all"
>
<div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600">
<Clock className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pending Tests</p>
<h4 className="text-3xl font-black text-slate-900">{stats.pending}</h4>
</div>
</button>
<button
type="button"
onClick={() => { setQueueStatusFilter('completed'); setView('queue'); }}
className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6 text-left hover:border-green-200 hover:shadow-md transition-all"
>
<div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
<CheckCircle2 className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Completed</p>
<h4 className="text-3xl font-black text-slate-900">{stats.completed}</h4>
</div>
</button>
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
<div className="flex items-center justify-between mb-4">
<div className="flex items-center gap-2">
<span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
<Beaker className="w-4 h-4" />
</span>
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Today</p>
</div>
</div>
<div className="flex items-end justify-between gap-4">
<h4 className="text-3xl font-black text-slate-900">{stats.today}</h4>
<div className="flex items-end gap-0.5 h-8">
{last7DaysTests.map((d, i) => {
const max = Math.max(...last7DaysTests.map(x => x.count), 1);
return (
<div key={i} className={cn("w-1.5 rounded-sm", i === 6 ? "bg-blue-500" : "bg-slate-200")}
style={{ height: `${Math.max((d.count / max) * 100, 8)}%` }} title={`${d.label}: ${d.count}`} />
);
})}
</div>
</div>
<div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50 text-xs">
<span className="text-slate-400">vs yesterday</span>
<span className={cn("flex items-center gap-1 font-bold px-1.5 py-0.5 rounded-full", testsTrendPct >= 0 ? "text-blue-600 bg-blue-50" : "text-red-500 bg-red-50")}>
{testsTrendPct >= 0 ? '↑' : '↓'} {Math.abs(testsTrendPct)}%
</span>
</div>
</div>
<div className="md:col-span-3 bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6">Tests by Type</h3>
{testsByType.length === 0 ? (
<p className="text-sm text-slate-400 text-center py-8">No lab tests yet.</p>
) : (
<div className="space-y-3">
{testsByType.map((row) => (
<div key={row.label} className="flex items-center gap-4">
<span className="text-xs font-bold text-slate-600 w-40 truncate shrink-0">{row.label}</span>
<div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
<div className="h-full bg-blue-500 rounded-full" style={{ width: `${row.pct}%` }} />
</div>
<span className="text-xs font-bold text-slate-900 w-16 text-right shrink-0">{row.count} ({row.pct}%)</span>
</div>
))}
</div>
)}
</div>
<div className="md:col-span-3 bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100">
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
<p className="text-xs text-slate-500">Patient: {test.patient?.name || test.patientId}{test.familyMemberName && <span className="ml-2 font-bold text-amber-700">For: {test.familyMemberName}</span>}</p>
</div>
</div>
<div className="text-right">
<span className={cn(
"text-[11px] font-bold px-2 py-0.5 rounded-full uppercase",
test.result ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
)}>
{test.result ? 'Completed' : 'Pending'}
</span>
<p className="text-[11px] text-slate-400 mt-1">{format(new Date(test.createdAt), 'MMM d, HH:mm')}</p>
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
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-8">
<div className="flex items-center justify-between mb-8 flex-wrap gap-4">
<div>
<h3 className="text-xl font-bold text-slate-900">Lab Test Catalog</h3>
<p className="text-slate-500 text-sm">Set prices here — Doctor/Nurse recommendations auto-fill from this list.</p>
</div>
<div className="flex items-center gap-3">
<div className="relative w-64">
<Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
<input
type="text"
placeholder="Search tests..."
value={catalogSearch}
onChange={(e) => setCatalogSearch(e.target.value)}
className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
/>
</div>
<div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap">
{testCatalog.length} Tests
</div>
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
{filteredTestCatalog.map((test) => (
<div key={test.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 group hover:border-blue-200 transition-all">
<div className="flex items-center justify-between gap-3 mb-3">
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
{(user?.role === 'CMD' || user?.role === 'Lab') && (
<button
onClick={() => setDeletingCatalogTest(test)}
className="p-2 text-slate-300 hover:text-red-600 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
title="Remove test from catalog"
>
<Trash2 className="w-4 h-4" />
</button>
)}
</div>
<div className="flex items-center gap-2 pt-3 border-t border-slate-100">
<Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
<SearchSelect size="sm" className="flex-1 min-w-0" value={test.linkedResourceId || ''}
onChange={v => handleLinkCatalogResource(test.id, v, test.resourceQtyPerTest)}
placeholder="No resource used — type to search"
options={resources.map(r => ({ value: r.id, label: r.name }))} />
{test.linkedResourceId && (
<input
type="number"
min="1"
value={test.resourceQtyPerTest}
onChange={e => handleLinkCatalogResource(test.id, test.linkedResourceId!, parseInt(e.target.value, 10) || 1)}
className="w-14 text-xs p-1.5 rounded-lg border border-slate-200 outline-none text-center"
title="Units consumed per test"
/>
)}
</div>
</div>
))}
</div>
{filteredTestCatalog.length === 0 && (
<p className="text-center text-slate-400 py-10">
{testCatalog.length === 0 ? 'No tests in the catalog yet.' : 'No tests match your search.'}
</p>
)}
</div>
) : view === 'resources' ? (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-8">
<div className="flex items-center justify-between mb-8 flex-wrap gap-4">
<div>
<h3 className="text-xl font-bold text-slate-900">Lab Resources</h3>
<p className="text-slate-500 text-sm">Consumables like test strips and reagents — stock auto-deducts when a linked test is resulted.</p>
</div>
<div className="flex items-center gap-3">
<div className="relative w-64">
<Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
<input
type="text"
placeholder="Search resources..."
value={resourceSearch}
onChange={(e) => setResourceSearch(e.target.value)}
className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
/>
</div>
<button
onClick={() => {
setEditingResource(null);
setResourceForm({ name: '', unit: 'strips', stock: '', lowStockThreshold: '10' });
setIsAddingResource(true);
}}
className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 whitespace-nowrap"
>
<Plus className="w-4 h-4" /> Add Resource
</button>
</div>
</div>
<div className="overflow-x-auto scroll-thin table-scroll [&_table]:block [&_thead]:hidden [&_tbody]:block [&_tr]:block [&_tr]:p-4 [&_tr]:border-b [&_tr]:border-slate-100 [&_td]:block [&_td]:!px-0 [&_td]:!py-1 [&_td:empty]:hidden">
<table className="w-full text-left text-sm">
<thead>
<tr className="border-b border-slate-100 text-slate-400 uppercase text-xs tracking-wider">
<th className="px-4 py-3">Resource</th>
<th className="px-4 py-3">Category</th>
<th className="px-4 py-3">Stock</th>
<th className="px-4 py-3">Unit</th>
<th className="px-4 py-3">Actions</th>
</tr>
</thead>
<tbody>
{filteredResources.map((item) => (
<tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
<td className="px-4 py-4 font-medium text-slate-700">{item.name}</td>
<td className="px-4 py-4 text-slate-500">{item.category || '—'}</td>
<td className={cn("px-4 py-4 font-bold", item.stock < item.lowStockThreshold ? "text-red-500" : "text-slate-700")}>
{item.stock}
{item.stock < item.lowStockThreshold && (
<span className="ml-2 text-xs font-bold bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Low</span>
)}
</td>
<td className="px-4 py-4 text-slate-500">{item.unit}</td>
<td className="px-4 py-4">
<div className="flex gap-2">
<button
onClick={() => {
setEditingResource(item);
setResourceForm({
name: item.name,
unit: item.unit,
stock: item.stock.toString(),
lowStockThreshold: item.lowStockThreshold.toString(),
});
setIsAddingResource(true);
}}
className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
>
<Save className="w-4 h-4" />
</button>
<button
onClick={() => setDeletingResource(item)}
className="p-2 text-slate-400 hover:text-red-600 transition-colors"
>
<Trash2 className="w-4 h-4" />
</button>
</div>
</td>
</tr>
))}
{filteredResources.length === 0 && (
<tr>
<td colSpan={5} className="p-12 text-center text-slate-400 italic">
{resources.length === 0 ? 'No lab resources yet.' : 'No resources match your search.'}
</td>
</tr>
)}
</tbody>
</table>
</div>
{isAddingResource && (
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
<div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] overflow-y-auto pb-safe">
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="text-lg font-bold flex items-center gap-2">
<Package className="w-5 h-5 text-blue-400" /> {editingResource ? 'Edit Resource' : 'Add Resource'}
</h3>
<button onClick={() => { setIsAddingResource(false); setEditingResource(null); }} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
<form onSubmit={handleSaveResource} className="p-6 space-y-4">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Name</label>
<input
required
value={resourceForm.name}
onChange={e => setResourceForm({ ...resourceForm, name: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
placeholder="e.g. Malaria RDT Strips"
/>
</div>
<div className="grid grid-cols-2 gap-4">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Unit</label>
<input
value={resourceForm.unit}
onChange={e => setResourceForm({ ...resourceForm, unit: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
placeholder="strips, vials, swabs..."
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Stock</label>
<input
type="number"
required
min="0"
value={resourceForm.stock}
onChange={e => setResourceForm({ ...resourceForm, stock: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
placeholder="0"
/>
</div>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Low Stock Alert Threshold</label>
<input
type="number"
min="0"
value={resourceForm.lowStockThreshold}
onChange={e => setResourceForm({ ...resourceForm, lowStockThreshold: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
placeholder="10"
/>
</div>
<button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all">
{editingResource ? 'Update Resource' : 'Save Resource'}
</button>
</form>
</div>
</div>
)}
<ConfirmModal
isOpen={!!deletingResource}
title="Delete Resource"
message={`Delete "${deletingResource?.name}" from lab resources? Any test currently linked to it will stop deducting stock automatically.`}
confirmText="Delete"
onConfirm={handleDeleteResource}
onCancel={() => setDeletingResource(null)}
/>
</div>
) : view === 'manual' ? (
<div className="max-w-2xl mx-auto">
<form onSubmit={handleManualEntry} className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center gap-2">
<Plus className="w-5 h-5 text-blue-400" />
<h3 className="font-bold">Manual Lab Entry</h3>
</div>
<div className="p-4 sm:p-8 space-y-6">
<div className="space-y-2">
<div className="flex items-center justify-between">
<label className="text-sm font-bold text-slate-700">Patient</label>
<button type="button" onClick={() => setShowWalkIn(true)} className="text-xs font-bold text-blue-600 hover:underline">
+ Walk-in (no card)
</button>
</div>
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
<p className="text-[11px] text-slate-400">{p.age} · {p.gender}</p>
</div>
<span className="text-xs font-bold text-blue-600 shrink-0 ml-2">{p.cardId}</span>
</button>
))}
</div>
)}
</div>
</div>
{manualFamilyMembers.length > 0 && (
<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
<label className="text-sm font-bold text-amber-900 flex items-center gap-2">
<UsersIcon className="w-4 h-4" /> Family Member Being Tested
</label>
<select
required
value={manualFamilyMemberId}
onChange={e => setManualFamilyMemberId(e.target.value)}
className="w-full p-3 rounded-xl border border-amber-300 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="" disabled>Select family member</option>
{manualFamilyMembers.map(m => (
<option key={m.id} value={m.id}>{m.name}</option>
))}
</select>
</div>
)}
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Test / Scan Type</label>
<div className="relative">
<input
value={manualEntry.testType}
onChange={e => {
setManualEntry({ ...manualEntry, testType: e.target.value });
setTestTypeOpen(true);
}}
onFocus={() => setTestTypeOpen(true)}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="Type to search tests & scans..."
/>
{testTypeOpen && manualEntry.testType && !testCatalog.some(t => t.name === manualEntry.testType) && (
<div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
{testCatalog.filter(t => t.name.toLowerCase().includes(manualEntry.testType.toLowerCase())).slice(0, 8).map(test => (
<button
key={test.id}
type="button"
onClick={() => {
setManualEntry({ ...manualEntry, testType: test.name, price: test.price.toString() });
setTestTypeOpen(false);
}}
className="w-full flex items-center justify-between text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors"
>
<span className="font-medium">{test.name}</span>
<span className="text-xs font-bold text-slate-500">₦{test.price.toLocaleString()}</span>
</button>
))}
{testCatalog.filter(t => t.name.toLowerCase().includes(manualEntry.testType.toLowerCase())).length === 0 && (
<p className="px-4 py-3 text-sm text-slate-400">No matching tests in the catalog.</p>
)}
</div>
)}
</div>
<p className="text-[11px] text-slate-400">Price auto-fills from the catalog — you can still adjust it below for this specific entry.</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Report Template</label>
<select
value={manualType}
onChange={e => setManualEntry({ ...manualEntry, reportType: e.target.value as 'basic' | 'comprehensive' })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
>
<option value="basic">Basic Lab Request Form</option>
<option value="comprehensive">Comprehensive Lab Report</option>
</select>
{manualType === 'comprehensive' && (
<p className="text-xs text-slate-500">Structured panels are filled after creation, from the Test Queue → Enter Result.</p>
)}
</div>
{manualType === 'basic' && (
<LabRequestFormPaper
values={manualPaper}
onChange={handleManualPaperChange}
wards={wardCatalog.map(w => w.name)}
consultants={consultants.map(c => c.name)}
onAddWard={handleAddWard}
/>
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
{manualType === 'comprehensive' && (
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Result / Observations</label>
<textarea
value={manualEntry.result}
onChange={e => setManualEntry({ ...manualEntry, result: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[150px]"
placeholder="Enter test results and patient information..."
/>
</div>
)}
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
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8">
{/* Test Queue */}
<div className="lg:col-span-12 space-y-6">
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<FlaskConical className="w-5 h-5 text-purple-600" /> Test Queue
</h3>
<div className="flex gap-2 text-xs font-bold uppercase tracking-wider">
<button type="button" onClick={() => setQueueStatusFilter('all')} className={cn("px-3 py-1 rounded-full transition-colors", queueStatusFilter === 'all' ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>All</button>
<button type="button" onClick={() => setQueueStatusFilter('pending')} className={cn("flex items-center gap-1 px-3 py-1 rounded-full transition-colors", queueStatusFilter === 'pending' ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-500 hover:bg-orange-100")}><Clock className="w-3 h-3" /> Pending</button>
<button type="button" onClick={() => setQueueStatusFilter('completed')} className={cn("flex items-center gap-1 px-3 py-1 rounded-full transition-colors", queueStatusFilter === 'completed' ? "bg-green-500 text-white" : "bg-green-50 text-green-500 hover:bg-green-100")}><CheckCircle className="w-3 h-3" /> Completed</button>
</div>
</div>
<div className="overflow-x-auto scroll-thin table-scroll [&_table]:block [&_thead]:hidden [&_tbody]:block [&_tr]:block [&_tr]:p-4 [&_tr]:border-b [&_tr]:border-slate-100 [&_td]:block [&_td]:!px-0 [&_td]:!py-1 [&_td:empty]:hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Patient</th>
<th className="px-6 py-4">Tests</th>
<th className="px-6 py-4">Payment</th>
<th className="px-6 py-4">Status</th>
<th className="px-6 py-4">Action</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{queueGroups.map(group => (
<LabGroupRow
key={group.key}
group={group}
onOpen={() => setSelectedGroupKey(group.key)}
onDelete={(id) => setDeleteConfirmId(id)}
onPrint={(list) => setPrintTests(list)}
/>
))}
{queueGroups.length === 0 && !loading && (
<tr>
<td colSpan={5} className="px-6 py-20 text-center text-slate-400">
{tests.length === 0 ? 'No test requests found.' : `No ${queueStatusFilter} tests.`}
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
</div>
</div>
)}
{/* Patient History Modal */}
<AnimatePresence>
{showHistory && historyPatientId && (
<div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
<div className="w-full max-w-5xl my-2 sm:my-8">
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
<ConfirmModal
isOpen={!!deletingCatalogTest}
title="Remove Test From Catalog"
message={`Remove "${deletingCatalogTest?.name}" from the test catalog? It will no longer appear as an option when ordering new lab tests, but existing lab records referencing it are unaffected.`}
confirmText="Remove"
onConfirm={handleDeleteCatalogTest}
onCancel={() => setDeletingCatalogTest(null)}
/>
{printTests && (
<LabReportPrint tests={printTests} onClose={() => setPrintTests(null)} />
)}
</div>
);
};
