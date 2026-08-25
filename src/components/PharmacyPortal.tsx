import React, { useState, useEffect } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { InventoryItem, MedicalRecord, Patient } from '../types';
import { toast } from 'sonner';
import { Pill, Search, Plus, Trash2, Edit, Save, X, ClipboardList, FileText, User, Activity, DollarSign, LayoutDashboard, Package, AlertCircle, TrendingUp, History } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { NAFDAC_DRUGS } from '../data/hospitalData';
import { logAction } from '../lib/audit';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender, dob: r.dob,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});
const inventoryFromRow = (r: any): InventoryItem => ({
id: r.id, name: r.name, price: r.price, stock: r.stock,
category: r.category, lastUpdated: r.last_updated,
});
interface Props {
userId: string;
}
export const PharmacyPortal: React.FC<Props> = ({ userId }) => {
const [inventory, setInventory] = useState<InventoryItem[]>([]);
const [prescriptions, setPrescriptions] = useState<(MedicalRecord & { patient?: Patient })[]>([]);
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
price: ''
});
useEffect(() => {
fetchInventory();
fetchPrescriptionsFromRecords();
fetchPrescriptionsFromVisits();
const channel = supabase
.channel('pharmacy-portal')
.on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchInventory)
.on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records' }, fetchPrescriptionsFromRecords)
.on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, fetchPrescriptionsFromVisits)
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchInventory = async () => {
const { data, error } = await supabase.from('inventory').select('*').order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'inventory');
const mapped = (data || []).map(inventoryFromRow);
setInventory(mapped);
if (mapped.length === 0) {
seedInitialDrugs();
}
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
const withPrescriptions = (data || []).filter((r: any) => r.prescriptions && r.prescriptions.length > 0);
const recordsWithPatients = withPrescriptions.map((r: any) => ({
id: `mr_${r.id}`,
patientId: r.patient_id,
staffId: r.staff_id,
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
const seedInitialDrugs = async () => {
toast.info('Seeding NAFDAC approved drugs...');
try {
const rows = NAFDAC_DRUGS.map(drugName => ({
name: drugName,
price: Math.floor(Math.random() * 5000) + 500,
stock: Math.floor(Math.random() * 100) + 20,
category: 'General',
}));
// Insert in batches of 50 (matches original batching intent —
// avoids one oversized request)
const batchSize = 50;
for (let i = 0; i < rows.length; i += batchSize) {
const { error } = await supabase.from('inventory').insert(rows.slice(i, i + batchSize));
if (error) throw error;
}
toast.success(`${rows.length}+ NAFDAC approved drugs added to inventory!`);
} catch (error) {
handleSupabaseError(error, 'insert', 'inventory');
}
};
const handleSaveDrug = async (e: React.FormEvent) => {
e.preventDefault();
try {
const drugData = {
name: drugForm.name,
price: parseFloat(drugForm.price),
stock: editingDrug ? undefined : 50, // preserve existing stock on edit
category: 'General',
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
setDrugForm({ name: '', price: '' });
setIsAddingDrug(false);
setEditingDrug(null);
} catch (error) {
handleSupabaseError(error, editingDrug ? 'update' : 'insert', 'inventory');
}
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
onClick={() => setView('inventory')}
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
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
<Package className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Drugs</p>
<h4 className="text-3xl font-black text-slate-900">{stats.totalDrugs}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-600">
<AlertCircle className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Low Stock</p>
<h4 className="text-3xl font-black text-slate-900">{stats.lowStock}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
<TrendingUp className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pending Rx</p>
<h4 className="text-3xl font-black text-slate-900">{stats.pendingPrescriptions}</h4>
</div>
</div>
<div className="md:col-span-3 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
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
<p className="text-xs text-slate-500">{rx.prescriptions.join(', ')}</p>
</div>
</div>
<div className="text-right">
<p className="text-[10px] text-slate-400">{format(new Date(rx.createdAt), 'MMM d, HH:mm')}</p>
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
<div className="flex items-center justify-between">
<h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
<Package className="w-6 h-6 text-blue-600" /> Drug Inventory
</h3>
<button
onClick={() => {
setEditingDrug(null);
setDrugForm({ name: '', price: '' });
setIsAddingDrug(true);
}}
className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2"
>
<Plus className="w-4 h-4" /> Add Drug
</button>
</div>
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Drug Name</th>
<th className="px-6 py-4">Category</th>
<th className="px-6 py-4">Price (₦)</th>
<th className="px-6 py-4">Stock</th>
<th className="px-6 py-4">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{inventory.map((item) => (
<tr key={item.id} className="hover:bg-slate-50 transition-colors">
<td className="px-6 py-4 font-bold text-slate-900">{item.name}</td>
<td className="px-6 py-4">
<span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase">
{item.category || 'General'}
</span>
</td>
<td className="px-6 py-4 font-bold text-blue-600">₦{item.price.toLocaleString()}</td>
<td className="px-6 py-4">
<span className={cn(
"font-bold",
(item.stock || 0) < 10 ? "text-red-500" : "text-slate-700"
)}>
{item.stock || 0}
</span>
</td>
<td className="px-6 py-4">
<div className="flex gap-2">
<button
onClick={() => {
setEditingDrug(item);
setDrugForm({
name: item.name,
price: item.price.toString()
});
setIsAddingDrug(true);
}}
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
</tbody>
</table>
</div>
</div>
</div>
) : (
<div className="space-y-6">
<h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
<ClipboardList className="w-6 h-6 text-blue-600" /> Prescription Queue
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
<p className="text-[10px] text-slate-400">{rx.patientId}</p>
</div>
</div>
<div className="text-right">
<span className="text-[10px] text-slate-400 block">{format(new Date(rx.createdAt), 'HH:mm')}</span>
{rx.paymentStatus && (
<span className={cn(
"text-[10px] font-bold uppercase",
rx.paymentStatus === 'paid' ? "text-green-600" : "text-yellow-600"
)}>
{rx.paymentStatus}
</span>
)}
</div>
</div>
<div className="space-y-2">
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prescriptions</p>
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
)}
{/* Add/Edit Drug Modal */}
<AnimatePresence>
{isAddingDrug && (
<div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
>
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="font-bold flex items-center gap-2">
<Pill className="w-5 h-5 text-blue-400" /> {editingDrug ? 'Edit Drug' : 'Add New Drug'}
</h3>
<button onClick={() => { setIsAddingDrug(false); setEditingDrug(null); }} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
<form onSubmit={handleSaveDrug} className="p-8 space-y-6">
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
