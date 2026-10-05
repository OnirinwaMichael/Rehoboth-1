import React, { useState, useEffect, useMemo } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { InventoryItem, MedicalRecord, Patient, Prescription } from '../types';
import { toast } from 'sonner';
import { Pill, Search, Plus, Trash2, Edit, Save, X, ClipboardList, FileText, User, Activity, DollarSign, LayoutDashboard, Package, AlertCircle, TrendingUp, History, CalendarClock } from 'lucide-react';
import { expiryStatus, formatExpiry, EXPIRY_WARNING_DAYS } from '../lib/expiry';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { logAction } from '../lib/audit';
import { groupPrescriptions } from '../lib/groupPrescriptions';
import { paymentRecorded } from '../lib/paymentGate';
import { PharmacyRxGroupCard } from './PharmacyRxGroupCard';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});
const inventoryFromRow = (r: any): InventoryItem => ({
id: r.id, name: r.name, price: r.price, stock: r.stock,
category: r.category, lastUpdated: r.last_updated,
billingBasis: r.billing_basis, expiryDate: r.expiry_date, priceVerified: r.price_verified, stockVerified: r.stock_verified,
oversoldCount: r.oversold_count, oversoldUnits: r.oversold_units,
});
const prescriptionFromRow = (r: any): Prescription & { patient?: Patient } => ({
id: r.id, patientId: r.patient_id, recordId: r.record_id, staffId: r.staff_id,
familyMemberId: r.family_member_id ?? undefined, familyMemberName: r.family_members?.name,
drugName: r.drug_name, drugPrice: r.drug_price, quantity: r.quantity,
paymentStatus: r.payment_status, createdAt: r.created_at,
dosageMorning: r.dosage_morning, dosageAfternoon: r.dosage_afternoon, dosageNight: r.dosage_night,
durationDays: r.duration_days, route: r.route, instructions: r.instructions,
dispensed: r.dispensed, dispensedAt: r.dispensed_at, dispensedBy: r.dispensed_by,
billingBasis: r.billing_basis, proposedQuantity: r.proposed_quantity,
quantityConfirmed: r.quantity_confirmed, quantityConfirmedAt: r.quantity_confirmed_at,
stockDeducted: r.stock_deducted,
patient: r.patients ? patientFromRow(r.patients) : undefined,
});
interface Props {
userId: string;
}
export const PharmacyPortal: React.FC<Props> = ({ userId }) => {
const [inventory, setInventory] = useState<InventoryItem[]>([]);
const [inventorySearch, setInventorySearch] = useState('');
const [showLowStockOnly, setShowLowStockOnly] = useState(false);
const [expiryFilter, setExpiryFilter] = useState<'all' | 'soon' | 'expired'>('all');
const expiryCounts = useMemo(() => {
let expired = 0, soon = 0;
for (const item of inventory) {
const st = expiryStatus(item.expiryDate).state;
if (st === 'expired') expired++; else if (st === 'soon') soon++;
}
return { expired, soon };
}, [inventory]);
const filteredInventory = useMemo(() => {
const q = inventorySearch.trim().toLowerCase();
let list = inventory;
if (showLowStockOnly) list = list.filter(item => (item.stock || 0) < 10);
if (expiryFilter !== 'all') list = list.filter(item => expiryStatus(item.expiryDate).state === expiryFilter);
if (!q) return list;
return list.filter(item =>
item.name.toLowerCase().includes(q) || (item.category || '').toLowerCase().includes(q)
);
}, [inventory, inventorySearch, showLowStockOnly, expiryFilter]);
const [prescriptions, setPrescriptions] = useState<(MedicalRecord & { patient?: Patient })[]>([]);
const [familyNameById, setFamilyNameById] = useState<Record<string, string>>({});
const [structuredRx, setStructuredRx] = useState<(Prescription & { patient?: Patient })[]>([]);
const [loading, setLoading] = useState(true);
const [view, setView] = useState<'dashboard' | 'inventory' | 'prescriptions'>('dashboard');
const [isAddingDrug, setIsAddingDrug] = useState(false);
const [editingDrug, setEditingDrug] = useState<InventoryItem | null>(null);
const [stats, setStats] = useState({
totalDrugs: 0,
lowStock: 0,
pendingPrescriptions: 0
});
const [drugForm, setDrugForm] = useState({
name: '',
price: '',
stock: '',
billingBasis: 'per_unit' as 'per_unit' | 'per_pack',
expiryDate: '',
priceVerified: false,
stockVerified: false,
});
const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
const [rxBusy, setRxBusy] = useState(false);
// Drugs prescribed together are shown as one patient request. A request stays in the
// queue while any of its drugs is still undispensed.
const pendingRxGroups = useMemo(
() => groupPrescriptions(structuredRx).filter(g => g.items.some(i => !i.dispensed)),
[structuredRx]
);
// Real trend data for the Dispensed This Week sparkline — derived from
// `prescriptions` (medical_records + visits), which is already the full,
// uncapped list (no .limit() on either fetch), so no extra query needed.
// Structured `prescriptions` table rows have no dispensedAt field, so
// they aren't part of this flow metric.
const last7DaysDispensed = useMemo(() => {
const days: { label: string; count: number }[] = [];
for (let i = 6; i >= 0; i--) {
const d = new Date();
d.setDate(d.getDate() - i);
const key = format(d, 'yyyy-MM-dd');
days.push({
label: format(d, 'EEE'),
count: prescriptions.filter(p => p.dispensed && p.dispensedAt && p.dispensedAt.startsWith(key)).length,
});
}
return days;
}, [prescriptions]);
const dispensedTrendPct = useMemo(() => {
const today = last7DaysDispensed[6]?.count ?? 0;
const yesterday = last7DaysDispensed[5]?.count ?? 0;
if (yesterday === 0) return today > 0 ? 100 : 0;
return Math.round(((today - yesterday) / yesterday) * 100);
}, [last7DaysDispensed]);
useEffect(() => {
fetchInventory();
fetchPrescriptionsFromRecords();
fetchPrescriptionsFromVisits();
fetchStructuredPrescriptions();
const channel = supabase
.channel('pharmacy-portal')
.on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchInventory)
.on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records' }, fetchPrescriptionsFromRecords)
.on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, fetchPrescriptionsFromVisits)
.on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, fetchStructuredPrescriptions)
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchStructuredPrescriptions = async () => {
const { data, error } = await supabase
.from('prescriptions')
.select('*, patients(*), family_members(name)')
.order('created_at', { ascending: false });
if (error) return handleSupabaseError(error, 'select', 'prescriptions');
setStructuredRx((data || []).map(prescriptionFromRow));
};
const fetchInventory = async () => {
const { data, error } = await supabase.from('inventory').select('*').order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'inventory');
const mapped = (data || []).map(inventoryFromRow);
setInventory(mapped);
setStats(prev => ({
...prev,
totalDrugs: mapped.length,
lowStock: mapped.filter(d => (d.stock || 0) < 10).length,
}));
};
const fetchPrescriptionsFromRecords = async () => {
const { data, error } = await supabase
.from('medical_records')
.select('*, patients(*)')
.order('created_at', { ascending: false });
if (error) { handleSupabaseError(error, 'select', 'medical_records'); setLoading(false); return; }
const { data: famData } = await supabase.from('family_members').select('id, name');
const famNames: Record<string, string> = {};
(famData || []).forEach((m: any) => { famNames[m.id] = m.name; });
setFamilyNameById(famNames);
const withPrescriptions = (data || []).filter((r: any) => r.prescriptions && r.prescriptions.length > 0);
const recordsWithPatients = withPrescriptions.map((r: any) => ({
id: `mr_${r.id}`,
patientId: r.patient_id,
staffId: r.staff_id,
familyMemberId: r.family_member_id ?? null,
createdAt: r.created_at,
diagnosis: r.diagnosis,
prescriptions: r.prescriptions || [],
dispensed: r.dispensed,
dispensedAt: r.dispensed_at,
dispensedBy: r.dispensed_by,
paymentStatus: r.payment_status,
patient: r.patients ? patientFromRow(r.patients) : undefined,
}));
setPrescriptions(prev => {
const others = prev.filter(p => !p.id?.startsWith('mr_'));
const combined = [...others, ...recordsWithPatients].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
setStats(s => ({ ...s, pendingPrescriptions: combined.filter(c => !c.dispensed).length }));
return combined;
});
setLoading(false);
};
const fetchPrescriptionsFromVisits = async () => {
// Flat `visits` table replaces Firestore's per-patient subcollection
// + collectionGroup query — one simple select instead.
const { data, error } = await supabase
.from('visits')
.select('*, patients(*)')
.order('timestamp', { ascending: false });
if (error) return handleSupabaseError(error, 'select', 'visits');
const withPrescriptions = (data || []).filter((v: any) => v.prescription && v.prescription.trim().length > 0);
const visitsWithPatients = withPrescriptions.map((v: any) => ({
id: `v_${v.id}`,
rawId: v.id,
patientId: v.patient_id,
staffId: v.staff_id,
createdAt: v.timestamp,
diagnosis: v.diagnosis,
prescriptions: v.prescription.split(',').map((s: string) => s.trim()).filter(Boolean),
dispensed: v.dispensed,
dispensedAt: v.dispensed_at,
dispensedBy: v.dispensed_by,
paymentStatus: v.payment_status,
patient: v.patients ? patientFromRow(v.patients) : undefined,
isVisit: true,
}));
setPrescriptions(prev => {
const others = prev.filter(p => !p.id?.startsWith('v_'));
const combined = [...others, ...visitsWithPatients].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
setStats(s => ({ ...s, pendingPrescriptions: combined.filter(c => !c.dispensed).length }));
return combined;
});
};
const handleSaveDrug = async (e: React.FormEvent) => {
e.preventDefault();
try {
const drugData = {
name: drugForm.name,
price: parseFloat(drugForm.price),
stock: parseInt(drugForm.stock, 10) || 0,
category: 'General',
billing_basis: drugForm.billingBasis,
expiry_date: drugForm.expiryDate || null,
price_verified: drugForm.priceVerified,
stock_verified: drugForm.stockVerified,
last_updated: new Date().toISOString(),
};
if (editingDrug) {
const { error } = await supabase.from('inventory').update(drugData).eq('id', editingDrug.id);
if (error) throw error;
await logAction(userId, 'UPDATE_INVENTORY', `Updated drug: ${drugData.name}`);
toast.success('Drug updated successfully!');
} else {
const { error } = await supabase.from('inventory').insert(drugData);
if (error) throw error;
await logAction(userId, 'ADD_INVENTORY', `Added new drug: ${drugData.name}`);
toast.success('Drug added successfully!');
}
setDrugForm({ name: '', price: '', stock: '', billingBasis: 'per_unit', expiryDate: '', priceVerified: false, stockVerified: false });
setIsAddingDrug(false);
setEditingDrug(null);
} catch (error) {
handleSupabaseError(error, editingDrug ? 'update' : 'insert', 'inventory');
}
};
const startEditDrug = (item: InventoryItem) => {
setEditingDrug(item);
setDrugForm({
name: item.name,
price: item.price.toString(),
stock: (item.stock || 0).toString(),
billingBasis: item.billingBasis || 'per_unit',
expiryDate: item.expiryDate ? item.expiryDate.slice(0, 10) : '',
priceVerified: !!item.priceVerified,
stockVerified: !!item.stockVerified,
});
setIsAddingDrug(true);
};
const handleDeleteDrug = async (id: string) => {
const drug = inventory.find(d => d.id === id);
if (!confirm(`Are you sure you want to delete ${drug?.name}?`)) return;
const { error } = await supabase.from('inventory').delete().eq('id', id);
if (error) return handleSupabaseError(error, 'delete', 'inventory');
await logAction(userId, 'DELETE_INVENTORY', `Deleted drug: ${drug?.name}`);
toast.success('Drug deleted successfully!');
};
const handleDispense = async (record: any) => {
const table = record.isVisit ? 'visits' : 'medical_records';
const id = record.isVisit ? record.rawId : record.id.replace('mr_', '');
const { error } = await supabase.from(table).update({
dispensed: true,
dispensed_at: new Date().toISOString(),
dispensed_by: userId,
}).eq('id', id);
if (error) return handleSupabaseError(error, 'update', table);
await logAction(userId, 'DISPENSE_DRUGS', `Dispensed drugs for record ${record.id}`);
toast.success('Prescription marked as dispensed!');
};
const isRxExpired = (rx: Prescription) => {
const d = inventory.find(x => x.name.toLowerCase() === rx.drugName.toLowerCase());
return expiryStatus(d?.expiryDate).state === 'expired';
};
// One drug's quantity confirmation. Returns whether it worked; the caller refreshes.
const confirmOne = async (rx: Prescription, quiet = false): Promise<boolean> => {
const raw = qtyEdits[rx.id];
const qty = raw !== undefined && raw !== '' ? parseInt(raw, 10) : rx.quantity;
if (!Number.isFinite(qty) || qty < 1) { toast.error(`${rx.drugName}: quantity must be at least 1.`); return false; }
const { error } = await supabase.from('prescriptions')
.update({ quantity: qty, quantity_confirmed: true }).eq('id', rx.id);
if (error) { toast.error(`${rx.drugName}: ${error.message || 'could not confirm the quantity.'}`); return false; }
await logAction(userId, 'CONFIRM_RX_QUANTITY',
`Confirmed ${rx.drugName} x${qty} (proposed ${rx.proposedQuantity ?? rx.quantity}) for patient ${rx.patientId}`);
if (!quiet) toast.success(`Quantity confirmed: ${qty}`);
setQtyEdits(prev => { const n = { ...prev }; delete n[rx.id]; return n; });
return true;
};
const handleConfirmQuantity = async (rx: Prescription) => {
setRxBusy(true);
try { await confirmOne(rx); await fetchStructuredPrescriptions(); } finally { setRxBusy(false); }
};
const handleConfirmAll = async (items: Prescription[]) => {
if (items.length === 0) return;
setRxBusy(true);
try {
let done = 0;
for (const rx of items) { if (await confirmOne(rx, true)) done++; }
await fetchStructuredPrescriptions();
if (done === items.length) toast.success(`Quantities confirmed for ${done} drug${done === 1 ? '' : 's'}.`);
else toast.warning(`Confirmed ${done} of ${items.length}. Check the ones that failed.`);
} finally { setRxBusy(false); }
};
// One drug's dispensing: quantity confirmed, a payment recorded by the receptionist (full or part, or free), not expired.
const dispenseOne = async (rx: Prescription, quiet = false): Promise<{ ok: boolean; shortWarning?: string }> => {
const isFree = (rx.drugPrice || 0) * (rx.quantity || 1) === 0;
if (!rx.quantityConfirmed) { toast.error(`${rx.drugName}: confirm the quantity before dispensing.`); return { ok: false }; }
if (!paymentRecorded(rx.paymentStatus) && !isFree) { toast.error(`${rx.drugName}: the receptionist must record a payment before dispensing.`); return { ok: false }; }
if (isRxExpired(rx)) { toast.error(`${rx.drugName} is expired — update stock first.`); return { ok: false }; }
const drug = inventory.find(d => d.name.toLowerCase() === rx.drugName.toLowerCase());
const shortBy = !!drug && !!drug.stockVerified && (drug.stock || 0) < rx.quantity;
const { error } = await supabase.from('prescriptions').update({
dispensed: true,
dispensed_at: new Date().toISOString(),
dispensed_by: userId,
}).eq('id', rx.id);
if (error) { toast.error(`${rx.drugName}: ${error.message || 'could not dispense this prescription.'}`); return { ok: false }; }
await logAction(userId, 'DISPENSE_DRUGS', `Dispensed ${rx.drugName} x${rx.quantity} for patient ${rx.patientId}${rx.familyMemberName ? ` (member: ${rx.familyMemberName})` : ''}`);
if (shortBy && drug) {
const left = Math.max(0, 3 - (drug.oversoldCount || 0) - 1);
const msg = `${rx.drugName} was short in stock. ${left} more dispense${left === 1 ? '' : 's'} allowed before it must be restocked.`;
if (!quiet) toast.warning(msg);
return { ok: true, shortWarning: msg };
}
if (!quiet) toast.success('Marked as dispensed!');
return { ok: true };
};
const handleDispenseStructured = async (rx: Prescription) => {
setRxBusy(true);
try { await dispenseOne(rx); await fetchStructuredPrescriptions(); } finally { setRxBusy(false); }
};
// Drugs are dispensed one after another (not in parallel) so each one's stock check sees the previous one.
const handleDispenseAll = async (items: Prescription[]) => {
if (items.length === 0) return;
setRxBusy(true);
try {
let done = 0;
const warnings: string[] = [];
for (const rx of items) {
const r = await dispenseOne(rx, true);
if (r.ok) done++;
if (r.shortWarning) warnings.push(r.shortWarning);
}
await fetchStructuredPrescriptions();
if (done === items.length) toast.success(`${done} drug${done === 1 ? '' : 's'} dispensed.`);
else toast.warning(`Dispensed ${done} of ${items.length}. Check the ones that failed.`);
warnings.forEach(w => toast.warning(w));
} finally { setRxBusy(false); }
};
return (
<div className="space-y-8 max-w-7xl mx-auto">
<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
<div>
<h2 className="text-3xl font-bold text-slate-900">Pharmacy Portal</h2>
<p className="text-slate-500">Manage drug inventory and dispense prescriptions.</p>
</div>
<div className="flex flex-wrap gap-2">
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
onClick={() => setView('prescriptions')}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'prescriptions' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<ClipboardList className="w-4 h-4" /> Prescriptions
</button>
<button 
onClick={() => { setShowLowStockOnly(false); setView('inventory'); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'inventory' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<Package className="w-4 h-4" /> Inventory
</button>
</div>
</div>
{view === 'dashboard' ? (
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
<div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6">
<div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
<Package className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Drugs</p>
<h4 className="text-3xl font-black text-slate-900">{stats.totalDrugs}</h4>
</div>
</div>
<button
type="button"
onClick={() => { setShowLowStockOnly(true); setView('inventory'); }}
className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6 text-left hover:border-red-200 hover:shadow-md transition-all"
>
<div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-600">
<AlertCircle className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Low Stock</p>
<h4 className="text-3xl font-black text-slate-900">{stats.lowStock}</h4>
</div>
</button>
<button
type="button"
onClick={() => setView('prescriptions')}
className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6 text-left hover:border-green-200 hover:shadow-md transition-all"
>
<div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
<TrendingUp className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pending Rx</p>
<h4 className="text-3xl font-black text-slate-900">
{stats.pendingPrescriptions + pendingRxGroups.length}
</h4>
</div>
</button>
<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
<div className="flex items-center justify-between mb-4">
<div className="flex items-center gap-2">
<span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
<Package className="w-4 h-4" />
</span>
<p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dispensed This Week</p>
</div>
</div>
<div className="flex items-end justify-between gap-4">
<h4 className="text-3xl font-black text-slate-900">{last7DaysDispensed[6]?.count ?? 0}</h4>
<div className="flex items-end gap-0.5 h-8">
{last7DaysDispensed.map((d, i) => {
const max = Math.max(...last7DaysDispensed.map(x => x.count), 1);
return (
<div key={i} className={cn("w-1.5 rounded-sm", i === 6 ? "bg-emerald-500" : "bg-slate-200")}
style={{ height: `${Math.max((d.count / max) * 100, 8)}%` }} title={`${d.label}: ${d.count}`} />
);
})}
</div>
</div>
<div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50 text-xs">
<span className="text-slate-400">vs yesterday</span>
<span className={cn("flex items-center gap-1 font-bold px-1.5 py-0.5 rounded-full", dispensedTrendPct >= 0 ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50")}>
{dispensedTrendPct >= 0 ? '↑' : '↓'} {Math.abs(dispensedTrendPct)}%
</span>
</div>
</div>
<div className="md:col-span-2 lg:col-span-4 bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Prescriptions
</h3>
<div className="space-y-4">
{prescriptions.slice(0, 5).map((rx, idx) => (
<div key={idx} className="p-4 rounded-xl border border-slate-50 bg-slate-50/50 flex justify-between items-center">
<div className="flex items-center gap-4">
<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
Rx
</div>
<div>
<p className="font-bold text-slate-900">{rx.patient?.name || rx.patientId}</p>
{rx.familyMemberId && familyNameById[rx.familyMemberId] && (
<p className="text-[11px] font-bold text-amber-700">For: {familyNameById[rx.familyMemberId]}</p>
)}
<p className="text-xs text-slate-500">{rx.prescriptions.join(', ')}</p>
</div>
</div>
<div className="text-right">
<p className="text-[11px] text-slate-400">{format(new Date(rx.createdAt), 'MMM d, HH:mm')}</p>
</div>
</div>
))}
{prescriptions.length === 0 && (
<p className="text-center text-slate-400 py-10">No prescriptions found.</p>
)}
</div>
</div>
</div>
) : view === 'inventory' ? (
<div className="space-y-6">
<div className="flex items-center justify-between flex-wrap gap-4">
<h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
<Package className="w-6 h-6 text-blue-600" /> Drug Inventory
</h3>
<div className="flex items-center gap-3 flex-wrap">
<button
type="button"
onClick={() => setExpiryFilter(f => f === 'expired' ? 'all' : 'expired')}
className={cn(
"flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors",
expiryFilter === 'expired' ? "bg-red-600 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"
)}
>
<CalendarClock className="w-3.5 h-3.5" /> Expired ({expiryCounts.expired})
</button>
<button
type="button"
onClick={() => setExpiryFilter(f => f === 'soon' ? 'all' : 'soon')}
className={cn(
"flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors",
expiryFilter === 'soon' ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600 hover:bg-amber-100"
)}
>
<CalendarClock className="w-3.5 h-3.5" /> Expiring ≤{EXPIRY_WARNING_DAYS}d ({expiryCounts.soon})
</button>
<button
type="button"
onClick={() => setShowLowStockOnly(v => !v)}
className={cn(
"flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors",
showLowStockOnly ? "bg-red-500 text-white" : "bg-red-50 text-red-500 hover:bg-red-100"
)}
>
<AlertCircle className="w-3.5 h-3.5" /> Low Stock Only
</button>
<div className="relative w-64">
<Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
<input
type="text"
placeholder="Search drugs..."
value={inventorySearch}
onChange={(e) => setInventorySearch(e.target.value)}
className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
/>
</div>
<button
onClick={() => {
setEditingDrug(null);
setDrugForm({ name: '', price: '', stock: '', billingBasis: 'per_unit', expiryDate: '', priceVerified: false, stockVerified: false });
setIsAddingDrug(true);
}}
className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2"
>
<Plus className="w-4 h-4" /> Add Drug
</button>
</div>
</div>
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
{/* Phone: stacked cards */}
<div className="divide-y divide-slate-100 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 md:gap-4 md:p-4 md:divide-y-0 md:[&>*:not(p)]:rounded-2xl md:[&>*:not(p)]:border md:[&>*:not(p)]:border-slate-200 md:[&>*:not(p)]:bg-white md:[&>*:not(p)]:shadow-sm md:[&>p]:col-span-full">
{filteredInventory.map((item) => {
const ex = expiryStatus(item.expiryDate);
return (
<div key={item.id} className="p-4 space-y-3">
<div className="flex items-start justify-between gap-3">
<div className="min-w-0">
<p className="text-base font-bold text-slate-900">{item.name}</p>
<span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold uppercase">{item.category || 'General'}</span>
</div>
<p className="text-lg font-black text-blue-600 shrink-0">₦{item.price.toLocaleString()}</p>
</div>
{!item.priceVerified && <p className="text-xs font-bold uppercase text-amber-700">Price not confirmed</p>}
<div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
<div>
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Stock</p>
<p className={cn("text-sm font-bold", (item.stock || 0) < 10 ? "text-red-600" : "text-slate-700")}>{item.stock || 0}</p>
</div>
<div>
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Billed</p>
<p className="text-sm font-semibold text-slate-700">{item.billingBasis === 'per_pack' ? 'Per pack' : 'Per unit'}</p>
</div>
<div>
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Expiry</p>
<p className={cn("text-sm font-bold", ex.state === 'expired' ? "text-red-600" : ex.state === 'soon' ? "text-amber-700" : "text-slate-700")}>
{ex.state === 'none' ? 'Not set' : formatExpiry(item.expiryDate as string)}
</p>
</div>
</div>
{!item.stockVerified && <p className="text-xs font-bold uppercase text-amber-700">Count not confirmed</p>}
{(item.oversoldUnits || 0) > 0 && <p className="text-xs font-bold uppercase text-red-600">{item.oversoldUnits} dispensed beyond stock</p>}
{ex.state === 'expired' && <p className="text-xs font-bold uppercase text-red-600">Expired {Math.abs(ex.daysLeft as number)} day{Math.abs(ex.daysLeft as number) === 1 ? '' : 's'} ago</p>}
{ex.state === 'soon' && <p className="text-xs font-bold uppercase text-amber-700">{ex.daysLeft === 0 ? 'Expires today' : `Expires in ${ex.daysLeft} day${ex.daysLeft === 1 ? '' : 's'}`}</p>}
<div className="flex gap-2">
<button
onClick={() => startEditDrug(item)}
className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm active:bg-blue-100"
>
<Edit className="w-4 h-4" /> Edit
</button>
<button
onClick={() => handleDeleteDrug(item.id)}
className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl bg-red-50 text-red-700 font-bold text-sm active:bg-red-100"
>
<Trash2 className="w-4 h-4" /> Delete
</button>
</div>
</div>
);
})}
{filteredInventory.length === 0 && (
<p className="p-12 text-center text-slate-500 italic">
{inventory.length === 0 ? 'No drugs in inventory.' : expiryFilter === 'expired' ? 'No expired drugs recorded.' : expiryFilter === 'soon' ? `Nothing expires within ${EXPIRY_WARNING_DAYS} days.` : showLowStockOnly ? 'No low-stock drugs right now.' : 'No drugs match your search.'}
</p>
)}
</div>
{/* Tablet and desktop: table */}
<div className="hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Drug Name</th>
<th className="px-6 py-4">Category</th>
<th className="px-6 py-4">Price (₦)</th>
<th className="px-6 py-4">Billed</th>
<th className="px-6 py-4">Stock</th>
<th className="px-6 py-4">Expiry</th>
<th className="px-6 py-4">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{filteredInventory.map((item) => (
<tr key={item.id} className="hover:bg-slate-50 transition-colors">
<td className="px-6 py-4 font-bold text-slate-900">{item.name}</td>
<td className="px-6 py-4">
<span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold uppercase">
{item.category || 'General'}
</span>
</td>
<td className="px-6 py-4 font-bold text-blue-600">
₦{item.price.toLocaleString()}
{!item.priceVerified && <span className="block text-[11px] font-bold uppercase text-amber-600">price not confirmed</span>}
</td>
<td className="px-6 py-4 text-xs font-bold text-slate-600">{item.billingBasis === 'per_pack' ? 'Per pack' : 'Per unit'}</td>
<td className="px-6 py-4">
<span className={cn(
"font-bold",
(item.stock || 0) < 10 ? "text-red-500" : "text-slate-700"
)}>
{item.stock || 0}
</span>
{!item.stockVerified && <span className="block text-[11px] font-bold uppercase text-amber-600">count not confirmed</span>}
{(item.oversoldUnits || 0) > 0 && <span className="block text-[11px] font-bold uppercase text-red-600">{item.oversoldUnits} dispensed beyond stock</span>}
</td>
<td className="px-6 py-4">
{(() => {
const ex = expiryStatus(item.expiryDate);
if (ex.state === 'none') return <span className="text-[11px] font-bold uppercase text-slate-300">not recorded</span>;
return (
<span className="block">
<span className={cn("text-xs font-bold", ex.state === 'expired' ? "text-red-600" : ex.state === 'soon' ? "text-amber-600" : "text-slate-700")}>
{formatExpiry(item.expiryDate as string)}
</span>
{ex.state === 'expired' && <span className="block text-[11px] font-bold uppercase text-red-600">Expired {Math.abs(ex.daysLeft as number)} day{Math.abs(ex.daysLeft as number) === 1 ? '' : 's'} ago</span>}
{ex.state === 'soon' && <span className="block text-[11px] font-bold uppercase text-amber-600">{ex.daysLeft === 0 ? 'Expires today' : `Expires in ${ex.daysLeft} day${ex.daysLeft === 1 ? '' : 's'}`}</span>}
</span>
);
})()}
</td>
<td className="px-6 py-4">
<div className="flex gap-2">
<button
onClick={() => startEditDrug(item)}
className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
>
<Edit className="w-4 h-4" />
</button>
<button
onClick={() => handleDeleteDrug(item.id)}
className="p-2 text-slate-400 hover:text-red-500 transition-colors"
>
<Trash2 className="w-4 h-4" />
</button>
</div>
</td>
</tr>
))}
{filteredInventory.length === 0 && (
<tr>
<td colSpan={7} className="p-12 text-center text-slate-400 italic">
{inventory.length === 0 ? 'No drugs in inventory.' : expiryFilter === 'expired' ? 'No expired drugs recorded.' : expiryFilter === 'soon' ? `Nothing expires within ${EXPIRY_WARNING_DAYS} days.` : showLowStockOnly ? 'No low-stock drugs right now.' : 'No drugs match your search.'}
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
</div>
) : (
<div className="space-y-8">
<div className="space-y-6">
<h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
<Pill className="w-6 h-6 text-green-600" /> Prescriptions
</h3>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
{pendingRxGroups.map(group => (
<PharmacyRxGroupCard
key={group.key}
group={group}
qtyEdits={qtyEdits}
onQtyChange={(id, value) => setQtyEdits(prev => ({ ...prev, [id]: value }))}
isExpired={isRxExpired}
onConfirm={handleConfirmQuantity}
onDispense={handleDispenseStructured}
onConfirmAll={handleConfirmAll}
onDispenseAll={handleDispenseAll}
busy={rxBusy}
/>
))}
{pendingRxGroups.length === 0 && (
<div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
<Pill className="w-12 h-12 text-slate-200 mx-auto mb-4" />
<p className="text-slate-400 font-medium">No pending prescriptions</p>
</div>
)}
</div>
</div>
<div className="space-y-6">
<h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
<ClipboardList className="w-6 h-6 text-slate-400" /> Older Prescriptions (Legacy Format)
</h3>
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
{prescriptions.filter(rx => !rx.dispensed).map((rx) => (
<div key={rx.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
<div className="flex justify-between items-start mb-4">
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
{rx.patient?.name.charAt(0)}
</div>
<div>
<p className="font-bold text-slate-900">{rx.patient?.name}</p>
<p className="text-[11px] text-slate-400">{rx.patientId}</p>
{rx.familyMemberId && familyNameById[rx.familyMemberId] && (
<p className="text-[11px] font-bold text-amber-700">For: {familyNameById[rx.familyMemberId]}</p>
)}
</div>
</div>
<div className="text-right">
<span className="text-[11px] text-slate-400 block">{format(new Date(rx.createdAt), 'HH:mm')}</span>
{rx.paymentStatus && (
<span className={cn(
"text-[11px] font-bold uppercase",
rx.paymentStatus === 'paid' ? "text-green-600" : "text-yellow-600"
)}>
{rx.paymentStatus}
</span>
)}
</div>
</div>
<div className="space-y-2">
<p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Prescriptions</p>
<div className="flex flex-wrap gap-2">
{rx.prescriptions.map((p, i) => (
<span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
{p}
</span>
))}
</div>
</div>
<button 
onClick={() => handleDispense(rx)}
className="w-full mt-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all text-sm"
>
Mark as Dispensed
</button>
</div>
))}
{prescriptions.filter(rx => !rx.dispensed).length === 0 && (
<div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
<Pill className="w-12 h-12 text-slate-200 mx-auto mb-4" />
<p className="text-slate-400 font-medium">No pending prescriptions</p>
</div>
)}
</div>
</div>
</div>
)}
{/* Add/Edit Drug Modal */}
<AnimatePresence>
{isAddingDrug && (
<div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] overflow-y-auto pb-safe"
>
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="font-bold flex items-center gap-2">
<Pill className="w-5 h-5 text-blue-400" /> {editingDrug ? 'Edit Drug' : 'Add New Drug'}
</h3>
<button onClick={() => { setIsAddingDrug(false); setEditingDrug(null); }} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
<form onSubmit={handleSaveDrug} className="p-4 sm:p-8 space-y-6">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Drug Name</label>
<input
required
value={drugForm.name}
onChange={e => setDrugForm({ ...drugForm, name: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="e.g. Paracetamol 500mg"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Price (₦)</label>
<input
type="number"
required
value={drugForm.price}
onChange={e => setDrugForm({ ...drugForm, price: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
placeholder="0.00"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Stock (units in hand)</label>
<input
type="number"
required
min="0"
value={drugForm.stock}
onChange={e => setDrugForm({ ...drugForm, stock: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
placeholder="0"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Expiry date</label>
<input
type="date"
value={drugForm.expiryDate}
onChange={e => setDrugForm({ ...drugForm, expiryDate: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
/>
<p className="text-xs text-slate-500">Expiry of the stock on the shelf. If batches differ, enter the earliest, and update it when a new batch arrives. Expired drugs can't be prescribed or dispensed. Leave blank if unknown.</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">How is this drug billed?</label>
<select
value={drugForm.billingBasis}
onChange={e => setDrugForm({ ...drugForm, billingBasis: e.target.value as 'per_unit' | 'per_pack' })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold bg-white"
>
<option value="per_unit">Per unit used (tablets, capsules, ampoules) — price × doses × days</option>
<option value="per_pack">Per pack (bottle, tube, vial, pack) — price × packs, normally 1</option>
</select>
</div>
<label className="flex items-start gap-3 text-sm text-slate-700">
<input type="checkbox" checked={drugForm.priceVerified} onChange={e => setDrugForm({ ...drugForm, priceVerified: e.target.checked })} className="mt-1 w-4 h-4" />
<span><b>Price is confirmed</b> — this is the real price per {drugForm.billingBasis === 'per_pack' ? 'pack' : 'unit'}.</span>
</label>
<label className="flex items-start gap-3 text-sm text-slate-700">
<input type="checkbox" checked={drugForm.stockVerified} onChange={e => setDrugForm({ ...drugForm, stockVerified: e.target.checked })} className="mt-1 w-4 h-4" />
<span><b>Stock count is real</b> — I counted it. Dispensing only reduces stock once this is ticked.</span>
</label>
<button
type="submit"
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
>
<Save className="w-5 h-5" />
{editingDrug ? 'Update Drug' : 'Save Drug'}
</button>
</form>
</motion.div>
</div>
)}
</AnimatePresence>
</div>
);
};
