import React, { useState, useEffect, useMemo, memo } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { FinancialRecord, Patient, MedicalRecord, Visit, Expense, BillingItem } from '../types';
import { toast } from 'sonner';
import { Receipt, Search, Plus, DollarSign, CreditCard, Banknote, User, CheckCircle, Clock, History, FileText, Save, X, LayoutDashboard, Wallet, ArrowUpRight, Trash2, User as UserIcon, FileSpreadsheet, TrendingDown, TrendingUp } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { logAction } from '../lib/audit';
import { PatientHistory } from './PatientHistory';
import { motion, AnimatePresence } from 'motion/react';
import { generateFinancialReport } from '../lib/excel';
import { useFormDraft } from '../hooks/useFormDraft';
import { ConfirmModal } from './ConfirmModal';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender, dob: r.dob,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});
const financialFromRow = (r: any): FinancialRecord => ({
id: r.id, patientId: r.patient_id, totalAmount: r.total_amount, paidAmount: r.paid_amount,
pendingAmount: r.pending_amount, paymentStatus: r.payment_status, paymentMethod: r.payment_method,
reconciled: r.reconciled, reconciledAt: r.reconciled_at, reconciledBy: r.reconciled_by,
createdAt: r.created_at,
});
const expenseFromRow = (r: any): Expense => ({
id: r.id, description: r.description, amount: r.amount, category: r.category,
staffId: r.staff_id, createdAt: r.created_at,
});
const billingItemFromRow = (r: any): BillingItem => ({
id: r.id, itemType: r.item_type, description: r.description, amount: r.amount,
paymentStatus: r.payment_status, createdAt: r.created_at,
paidSoFar: r.paid_so_far, balance: r.balance,
});
interface Props {
userId: string;
}
const TransactionRow = memo(({ record, onPrint, onDelete }: { 
record: FinancialRecord & { patient?: Patient }, 
onPrint: (record: FinancialRecord & { patient?: Patient }) => void,
onDelete: (id: string) => void 
}) => (
<tr className="hover:bg-slate-50 transition-colors group">
<td className="px-6 py-4">
<div className="flex items-center gap-3">
<div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
{record.patient?.name.charAt(0)}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{record.patient?.name}</p>
<p className="text-[10px] text-slate-400">{record.patientId}</p>
</div>
</div>
</td>
<td className="px-6 py-4">
<span className="text-sm font-semibold text-slate-700">₦{record.totalAmount.toLocaleString()}</span>
</td>
<td className="px-6 py-4">
<div className="text-xs">
<p className="text-green-600 font-bold">₦{record.paidAmount.toLocaleString()}</p>
<p className="text-red-500">₦{record.pendingAmount.toLocaleString()}</p>
</div>
</td>
<td className="px-6 py-4">
<span className={cn(
"text-[10px] font-bold px-2 py-1 rounded-full uppercase",
record.paymentStatus === 'fully paid' ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
)}>
{record.paymentStatus}
</span>
</td>
<td className="px-6 py-4">
<div className="flex items-center gap-2">
<button
onClick={() => onPrint(record)}
className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
title="Print Receipt"
>
<Receipt className="w-4 h-4" />
</button>
<button
onClick={() => onDelete(record.id)}
className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
title="Delete Transaction"
>
<Trash2 className="w-4 h-4" />
</button>
</div>
</td>
</tr>
));
const ExpenseRow = memo(({ expense, onDelete }: { 
expense: Expense, 
onDelete: (id: string) => void 
}) => (
<tr className="hover:bg-slate-50 transition-colors">
<td className="px-6 py-4 text-sm text-slate-600">
{format(new Date(expense.createdAt), 'MMM d, yyyy')}
</td>
<td className="px-6 py-4 font-bold text-slate-900">{expense.description}</td>
<td className="px-6 py-4">
<span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full uppercase">
{expense.category}
</span>
</td>
<td className="px-6 py-4 font-bold text-red-600">₦{expense.amount.toLocaleString()}</td>
<td className="px-6 py-4 text-right">
<button
onClick={() => onDelete(expense.id)}
className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
>
<Trash2 className="w-4 h-4" />
</button>
</td>
</tr>
));
export const AccountantPortal: React.FC<Props> = ({ userId }) => {
const [records, setRecords] = useState<(FinancialRecord & { patient?: Patient })[]>([]);
const [expenses, setExpenses] = useState<Expense[]>([]);
const [loading, setLoading] = useState(true);
const [searchId, setSearchId] = useState('');
const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
const [view, setView] = useState<'dashboard' | 'billing' | 'reconciliation' | 'patients' | 'expenses' | 'reports'>('dashboard');
const [allPatients, setAllPatients] = useState<Patient[]>([]);
const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
const [patientSearchQuery, setPatientSearchQuery] = useState('');
const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
const [stats, setStats] = useState({
totalRevenue: 0,
todayRevenue: 0,
pendingPayments: 0,
totalExpenses: 0,
netProfit: 0
});
const [showHistory, setShowHistory] = useState(false);
const [printingRecord, setPrintingRecord] = useState<(FinancialRecord & { patient?: Patient }) | null>(null);
const [deleteConfirm, setDeleteConfirm] = useState<{type: 'expense' | 'transaction', id: string} | null>(null);
const [payModal, setPayModal] = useState<{ item: BillingItem; amount: string; method: 'cash' | 'bank transfer' } | null>(null);
const { data: expenseForm, setData: setExpenseForm, clearDraft: clearExpenseDraft } = useFormDraft('accountant_expense_form', {
description: '',
amount: '',
category: 'others' as Expense['category']
});
useEffect(() => {
fetchFinancials();
fetchExpenses();
fetchAllPatients();
const channel = supabase
.channel('accountant-portal')
.on('postgres_changes', { event: '*', schema: 'public', table: 'financials' }, fetchFinancials)
.on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchExpenses)
.on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, fetchAllPatients)
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchFinancials = async () => {
const { data, error } = await supabase
.from('financials')
.select('*, patients(*)')
.order('created_at', { ascending: false });
if (error) {
handleSupabaseError(error, 'select', 'financials');
setLoading(false);
return;
}
const recordsWithPatients = (data || []).map((row: any) => ({
...financialFromRow(row),
patient: row.patients ? patientFromRow(row.patients) : undefined,
}));
setRecords(recordsWithPatients);
const { data: expensesData } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
const mappedExpenses = (expensesData || []).map(expenseFromRow);
const today = new Date().toISOString().split('T')[0];
const totalRev = recordsWithPatients.reduce((acc, r) => acc + r.paidAmount, 0);
const todayRev = recordsWithPatients.filter(r => r.createdAt.startsWith(today)).reduce((acc, r) => acc + r.paidAmount, 0);
const totalExp = mappedExpenses.reduce((acc, e) => acc + e.amount, 0);
setStats({
totalRevenue: totalRev,
todayRevenue: todayRev,
pendingPayments: recordsWithPatients.filter(r => r.paymentStatus !== 'fully paid').length,
totalExpenses: totalExp,
netProfit: totalRev - totalExp,
});
setLoading(false);
};
const fetchExpenses = async () => {
const { data, error } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
if (error) return handleSupabaseError(error, 'select', 'expenses');
setExpenses((data || []).map(expenseFromRow));
};
const fetchAllPatients = async () => {
const { data, error } = await supabase.from('patients').select('*');
if (error) return handleSupabaseError(error, 'select', 'patients');
const sorted = (data || []).map(patientFromRow)
.sort((a, b) => parseInt(a.cardId, 10) - parseInt(b.cardId, 10));
setAllPatients(sorted);
};
const handleSearch = async (e: React.FormEvent) => {
e.preventDefault();
try {
const { data: pData, error: patientErr } = await supabase.from('patients').select('*').eq('card_id', searchId).maybeSingle();
if (patientErr) throw patientErr;
if (pData) {
const patient = patientFromRow(pData);
setSelectedPatient(patient);
setView('billing');
await fetchBillingItems(searchId);
await logAction(userId, 'SEARCH_PATIENT_BILLING', `Searched billing for patient ${searchId}`);
} else {
toast.error('Patient not found.');
setSelectedPatient(null);
}
} catch (error) {
handleSupabaseError(error, 'select', 'patients');
}
};
const fetchBillingItems = async (patientCardId: string) => {
const { data, error } = await supabase.rpc('get_patient_billing', { p_patient_id: patientCardId });
if (error) return handleSupabaseError(error, 'select', 'billing_items');
setBillingItems((data || []).map(billingItemFromRow));
};
const handleConfirmPayment = async () => {
if (!payModal || !selectedPatient) return;
const amount = parseFloat(payModal.amount);
if (!amount || amount <= 0) {
toast.error('Enter a valid amount.');
return;
}
if (amount > payModal.item.balance) {
toast.error(`Amount cannot exceed the outstanding balance of ₦${payModal.item.balance.toLocaleString()}.`);
return;
}
try {
const { error } = await supabase.rpc('record_item_payment', {
p_item_type: payModal.item.itemType,
p_item_id: payModal.item.id,
p_patient_id: selectedPatient.cardId,
p_amount_paid: amount,
p_payment_method: payModal.method,
});
if (error) throw error;
await logAction(userId, 'RECORD_ITEM_PAYMENT', `Recorded ₦${amount} payment (${payModal.item.itemType}) for patient ${selectedPatient.cardId}`);
toast.success(amount >= payModal.item.balance ? 'Marked as paid!' : 'Partial payment recorded!');
const receipt = {
patientId: selectedPatient.cardId,
totalAmount: payModal.item.amount,
paidAmount: amount,
pendingAmount: Math.max(payModal.item.balance - amount, 0),
paymentStatus: amount >= payModal.item.balance ? 'fully paid' : 'partially paid',
paymentMethod: payModal.method,
createdAt: new Date().toISOString(),
patient: selectedPatient,
} as FinancialRecord & { patient: Patient };
setPrintingRecord(receipt);
setPayModal(null);
await fetchBillingItems(selectedPatient.cardId);
fetchFinancials();
} catch (error) {
handleSupabaseError(error, 'insert', 'financials');
}
};
const handleSaveExpense = async (e: React.FormEvent) => {
e.preventDefault();
const { error } = await supabase.from('expenses').insert({
description: expenseForm.description,
amount: parseFloat(expenseForm.amount),
category: expenseForm.category,
staff_id: userId,
});
if (error) return handleSupabaseError(error, 'insert', 'expenses');
await logAction(userId, 'RECORD_EXPENSE', `Recorded expense: ${expenseForm.description} (₦${expenseForm.amount})`);
toast.success('Expense recorded successfully');
clearExpenseDraft();
};
const handleDeleteExpense = async (id: string) => {
const { error } = await supabase.from('expenses').delete().eq('id', id);
if (error) return handleSupabaseError(error, 'delete', 'expenses');
toast.success('Expense deleted');
};
const handleDeleteTransaction = async (id: string) => {
const { error } = await supabase.from('financials').delete().eq('id', id);
if (error) return handleSupabaseError(error, 'delete', 'financials');
await logAction(userId, 'DELETE_TRANSACTION', `Deleted transaction ${id}`);
toast.success('Transaction deleted successfully');
};
const handleReconcile = async (recordId: string) => {
const { error } = await supabase.from('financials').update({
reconciled: true,
reconciled_at: new Date().toISOString(),
reconciled_by: userId,
}).eq('id', recordId);
if (error) return handleSupabaseError(error, 'update', 'financials');
toast.success('Payment reconciled successfully');
};
const handlePrint = (record: FinancialRecord & { patient?: Patient }) => {
const printWindow = window.open('', '_blank');
if (!printWindow) return;
const content = `
<html>
<head>
<title>Payment Receipt - ${record.patient?.name || record.patientId}</title>
<style>
body { font-family: sans-serif; padding: 40px; color: #333; }
.header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
.hospital-name { font-size: 24px; font-weight: bold; color: #2563eb; }
.receipt-title { font-size: 18px; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }
.details { margin-bottom: 30px; }
.row { display: flex; justify-content: space-between; margin-bottom: 10px; }
.label { font-weight: bold; color: #666; }
.table { width: 100%; border-collapse: collapse; margin-top: 20px; }
.table th, .table td { border: 1px solid #eee; padding: 12px; text-align: left; }
.table th { bg-color: #f9fafb; }
.footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
.stamp { margin-top: 30px; border: 2px solid #2563eb; color: #2563eb; display: inline-block; padding: 10px 20px; border-radius: 8px; font-weight: bold; transform: rotate(-5deg); }
@media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="header">
<div class="hospital-name">The Rehoboth Clinic and Maternity, Mopa</div>
<div class="receipt-title">Official Payment Receipt</div>
</div>
<div class="details">
<div class="row">
<span class="label">Receipt No:</span>
<span>${record.id || 'TEMP-' + Date.now()}</span>
</div>
<div class="row">
<span class="label">Date:</span>
<span>${format(new Date(record.createdAt), 'MMMM d, yyyy HH:mm')}</span>
</div>
<div class="row">
<span class="label">Patient Name:</span>
<span>${record.patient?.name || 'N/A'}</span>
</div>
<div class="row">
<span class="label">Card ID:</span>
<span>${record.patientId}</span>
</div>
</div>
<table class="table">
<thead>
<tr>
<th>Description</th>
<th>Amount</th>
</tr>
</thead>
<tbody>
<tr>
<td>Hospital Services / Clinical Fees</td>
<td>₦${record.totalAmount.toLocaleString()}</td>
</tr>
</tbody>
<tfoot>
<tr>
<th style="text-align: right;">Total Amount:</th>
<th>₦${record.totalAmount.toLocaleString()}</th>
</tr>
<tr>
<th style="text-align: right;">Amount Paid:</th>
<th>₦${record.paidAmount.toLocaleString()}</th>
</tr>
<tr>
<th style="text-align: right;">Balance Due:</th>
<th style="color: ${record.pendingAmount > 0 ? '#ef4444' : '#10b981'}">₦${record.pendingAmount.toLocaleString()}</th>
</tr>
</tfoot>
</table>
<div class="details" style="margin-top: 20px;">
<div class="row">
<span class="label">Payment Mode:</span>
<span style="text-transform: capitalize;">${record.paymentMethod}</span>
</div>
<div class="row">
<span class="label">Status:</span>
<span style="text-transform: capitalize; font-weight: bold; color: ${record.paymentStatus === 'fully paid' ? '#10b981' : '#f59e0b'}">${record.paymentStatus}</span>
</div>
</div>
<div style="text-align: right;">
<div class="stamp">PAID</div>
</div>
<div class="footer">
<p>Thank you for choosing Rehoboth Mopa Hospital.</p>
<p>This is a computer-generated receipt and does not require a physical signature.</p>
</div>
<script>
window.onload = () => {
window.print();
// window.close(); // Optional: close tab after printing
};
</script>
</body>
</html>
`;
printWindow.document.write(content);
printWindow.document.close();
};
return (
<div className="space-y-8 max-w-7xl mx-auto">
<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
<div>
<h2 className="text-3xl font-bold text-slate-900">Accountant Portal</h2>
<p className="text-slate-500">Manage patient billing and payments.</p>
</div>
<div className="flex flex-wrap gap-2">
<button 
onClick={() => { setView('dashboard'); setSelectedPatient(null); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'dashboard' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<LayoutDashboard className="w-4 h-4" /> Dashboard
</button>
<button 
onClick={() => { setView('reconciliation'); setSelectedPatient(null); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'reconciliation' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<CheckCircle className="w-4 h-4" /> Reconciliation
</button>
<button 
onClick={() => { setView('patients'); setSelectedPatient(null); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'patients' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<UserIcon className="w-4 h-4" /> Patients
</button>
<button 
onClick={() => { setView('expenses'); setSelectedPatient(null); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'expenses' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<TrendingDown className="w-4 h-4" /> Expenses
</button>
<button 
onClick={() => { setView('reports'); setSelectedPatient(null); }}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
view === 'reports' ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
)}
>
<FileSpreadsheet className="w-4 h-4" /> Reports
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
{view === 'dashboard' ? (
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
<Wallet className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.totalRevenue.toLocaleString()}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
<ArrowUpRight className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Today's Collection</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.todayRevenue.toLocaleString()}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600">
<Receipt className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pending Bills</p>
<h4 className="text-3xl font-black text-slate-900">{stats.pendingPayments}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-600">
<TrendingDown className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Expenses</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.totalExpenses.toLocaleString()}</h4>
</div>
</div>
<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
<div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600">
<TrendingUp className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Net Profit</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.netProfit.toLocaleString()}</h4>
</div>
</div>
<div className="md:col-span-3 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
<h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Transactions
</h3>
<div className="space-y-4">
{records.slice(0, 5).map((record, idx) => (
<div key={idx} className="p-4 rounded-xl border border-slate-50 bg-slate-50/50 flex justify-between items-center">
<div className="flex items-center gap-4">
<div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">
₦
</div>
<div>
<p className="font-bold text-slate-900">₦{record.paidAmount.toLocaleString()}</p>
<p className="text-xs text-slate-500">Patient: {record.patient?.name || record.patientId}</p>
</div>
</div>
<div className="text-right">
<span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase">
{record.paymentMethod}
</span>
<p className="text-[10px] text-slate-400 mt-1">{format(new Date(record.createdAt), 'MMM d, HH:mm')}</p>
</div>
</div>
))}
{records.length === 0 && (
<p className="text-center text-slate-400 py-10">No transactions recorded yet.</p>
)}
</div>
</div>
</div>
) : view === 'billing' ? (
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
{/* Itemized Billing */}
<div className="lg:col-span-12 space-y-6">
{selectedPatient ? (
<div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<div>
<h3 className="font-bold flex items-center gap-2">
<Receipt className="w-5 h-5 text-blue-400" /> {selectedPatient.name}
</h3>
<p className="text-xs text-slate-400">Card ID: {selectedPatient.cardId}</p>
</div>
<div className="flex items-center gap-1">
<button
onClick={() => setShowHistory(true)}
className="p-2 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors"
title="View Patient History"
>
<History className="w-4 h-4" />
</button>
<button onClick={() => { setSelectedPatient(null); setBillingItems([]); }} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
</div>
<div className="divide-y divide-slate-100">
{billingItems.length === 0 ? (
<p className="text-center text-slate-400 text-sm py-12">No billable items found for this patient.</p>
) : (
billingItems.map((item) => (
<div key={item.id} className="p-4 flex items-center justify-between gap-4">
<div className="min-w-0 flex-1">
<p className="text-sm font-bold text-slate-900 truncate">{item.description}</p>
<div className="flex items-center gap-2 mt-1">
<span className={cn(
"text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
item.paymentStatus === 'paid' && "bg-green-50 text-green-600 border-green-100",
item.paymentStatus === 'partial' && "bg-blue-50 text-blue-600 border-blue-100",
item.paymentStatus === 'pending' && "bg-orange-50 text-orange-600 border-orange-100",
)}>
{item.paymentStatus}
</span>
<span className="text-[10px] text-slate-400">{format(new Date(item.createdAt), 'MMM d, yyyy')}</span>
</div>
</div>
<div className="text-right">
<p className="text-sm font-black text-slate-900">₦{item.amount.toLocaleString()}</p>
{item.paidSoFar > 0 && item.balance > 0 && (
<p className="text-[10px] text-slate-400">Paid ₦{item.paidSoFar.toLocaleString()} · Owes ₦{item.balance.toLocaleString()}</p>
)}
</div>
{item.balance > 0 ? (
<button
onClick={() => setPayModal({ item, amount: item.balance.toString(), method: 'cash' })}
className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all"
>
Pay
</button>
) : (
<CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
)}
</div>
))
)}
</div>
</div>
) : (
<div className="bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center h-[400px]">
<Receipt className="w-12 h-12 text-slate-300 mb-4" />
<p className="text-slate-400 font-medium">Search for a patient to view their billing.</p>
</div>
)}
</div>
{/* Financial History */}
<div className="lg:col-span-12 space-y-6">
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Transactions
</h3>
</div>
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Patient</th>
<th className="px-6 py-4">Amount</th>
<th className="px-6 py-4">Paid/Pending</th>
<th className="px-6 py-4">Status</th>
<th className="px-6 py-4">Method</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{records.map((record, idx) => (
<TransactionRow 
key={record.id || idx} 
record={record} 
onPrint={handlePrint}
onDelete={(id) => setDeleteConfirm({ type: 'transaction', id })}
/>
))}
{records.length === 0 && !loading && (
<tr>
<td colSpan={5} className="px-6 py-20 text-center text-slate-400">
No transactions found.
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
</div>
</div>
) : view === 'reconciliation' ? (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<CheckCircle className="w-5 h-5 text-slate-400" /> Bank Transfer Reconciliation
</h3>
</div>
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Date</th>
<th className="px-6 py-4">Patient</th>
<th className="px-6 py-4">Amount</th>
<th className="px-6 py-4">Method</th>
<th className="px-6 py-4">Status</th>
<th className="px-6 py-4">Action</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{records.filter(r => r.paymentMethod === 'bank transfer').map((record, idx) => (
<tr key={idx} className="hover:bg-slate-50 transition-colors">
<td className="px-6 py-4 text-sm text-slate-600">
{format(new Date(record.createdAt), 'MMM d, yyyy HH:mm')}
</td>
<td className="px-6 py-4">
<p className="text-sm font-bold text-slate-900">{record.patient?.name}</p>
<p className="text-[10px] text-slate-400">{record.patientId}</p>
</td>
<td className="px-6 py-4">
<p className="text-sm font-bold text-slate-900">₦{record.paidAmount.toLocaleString()}</p>
</td>
<td className="px-6 py-4">
<span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded-full uppercase">
{record.paymentMethod}
</span>
</td>
<td className="px-6 py-4">
{record.reconciled ? (
<span className="text-[10px] font-bold bg-green-100 text-green-600 px-2 py-1 rounded-full uppercase flex items-center gap-1 w-fit">
<CheckCircle className="w-3 h-3" /> Reconciled
</span>
) : (
<span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-1 rounded-full uppercase flex items-center gap-1 w-fit">
<Clock className="w-3 h-3" /> Pending
</span>
)}
</td>
<td className="px-6 py-4">
{!record.reconciled && (
<button
onClick={() => handleReconcile(record.id)}
className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
>
Mark Reconciled
</button>
)}
</td>
</tr>
))}
{records.filter(r => r.paymentMethod === 'bank transfer').length === 0 && !loading && (
<tr>
<td colSpan={6} className="px-6 py-20 text-center text-slate-400">
No bank transfers found.
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
) : view === 'expenses' ? (
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
<div className="lg:col-span-4">
<div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="font-bold flex items-center gap-2">
<TrendingDown className="w-5 h-5 text-red-400" /> Record Expense
</h3>
</div>
<form onSubmit={handleSaveExpense} className="p-6 space-y-6">
<div className="space-y-4">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Description</label>
<input
type="text"
required
value={expenseForm.description}
onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="e.g., Electricity Bill"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Amount (₦)</label>
<input
type="number"
required
value={expenseForm.amount}
onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
placeholder="0.00"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Category</label>
<select
required
value={expenseForm.category}
onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
>
<option value="salaries">Salaries</option>
<option value="utilities">Utilities</option>
<option value="supplies">Supplies</option>
<option value="maintenance">Maintenance</option>
<option value="others">Others</option>
</select>
</div>
</div>
<button
type="submit"
className="w-full bg-red-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
>
<Save className="w-5 h-5" />
Save Expense
</button>
</form>
</div>
</div>
<div className="lg:col-span-8">
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Expense History
</h3>
</div>
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Date</th>
<th className="px-6 py-4">Description</th>
<th className="px-6 py-4">Category</th>
<th className="px-6 py-4">Amount</th>
<th className="px-6 py-4 text-right">Action</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{expenses.map((expense, idx) => (
<ExpenseRow 
key={expense.id || idx} 
expense={expense} 
onDelete={handleDeleteExpense}
/>
))}
{expenses.length === 0 && (
<tr>
<td colSpan={5} className="px-6 py-20 text-center text-slate-400">
No expenses recorded yet.
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
</div>
</div>
) : view === 'reports' ? (
<div className="max-w-4xl mx-auto space-y-8">
<div className="bg-white p-12 rounded-3xl shadow-xl border border-slate-100 text-center space-y-8">
<div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto">
<FileSpreadsheet className="w-12 h-12" />
</div>
<div>
<h3 className="text-3xl font-black text-slate-900">Financial Reports</h3>
<p className="text-slate-500 mt-2">Generate comprehensive Excel statements for the clinic's finances.</p>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
<div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
<h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
<TrendingUp className="w-4 h-4 text-green-600" /> Income Summary
</h4>
<p className="text-sm text-slate-500">Total revenue from patient billings and medical services.</p>
<p className="text-xl font-black text-green-600 mt-4">₦{stats.totalRevenue.toLocaleString()}</p>
</div>
<div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
<h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
<TrendingDown className="w-4 h-4 text-red-600" /> Expense Summary
</h4>
<p className="text-sm text-slate-500">Total expenditures including salaries, utilities, and supplies.</p>
<p className="text-xl font-black text-red-600 mt-4">₦{stats.totalExpenses.toLocaleString()}</p>
</div>
</div>
<div className="p-8 rounded-3xl bg-blue-600 text-white space-y-6 shadow-2xl shadow-blue-200">
<div className="flex justify-between items-center">
<div className="text-left">
<p className="text-blue-100 text-sm font-bold uppercase tracking-widest">Net Financial Position</p>
<h4 className="text-4xl font-black mt-1">₦{stats.netProfit.toLocaleString()}</h4>
</div>
<div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md">
<TrendingUp className="w-8 h-8" />
</div>
</div>
<button
onClick={() => generateFinancialReport({ income: records, expenses })}
className="w-full bg-white text-blue-600 py-5 rounded-2xl font-black text-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-3 shadow-lg"
>
<FileSpreadsheet className="w-6 h-6" />
Generate Excel Statement
</button>
<p className="text-blue-100 text-xs">
The report will include Daily, Weekly (Sun-Sat), Monthly, and Annual statements.
</p>
</div>
</div>
</div>
) : view === 'patients' ? (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<UserIcon className="w-5 h-5 text-slate-400" /> Patient Directory
</h3>
<div className="relative">
<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
<input
value={patientSearchQuery}
onChange={e => setPatientSearchQuery(e.target.value)}
className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none w-64 text-sm"
placeholder="Search by name or ID..."
/>
</div>
</div>
<div className="overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Card ID</th>
<th className="px-6 py-4">Name</th>
<th className="px-6 py-4">Category</th>
<th className="px-6 py-4">Phone</th>
<th className="px-6 py-4">Registered</th>
<th className="px-6 py-4 text-right">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{allPatients
.filter(p => p.name.toLowerCase().includes(patientSearchQuery.toLowerCase()) || p.cardId.includes(patientSearchQuery))
.map((p) => (
<React.Fragment key={p.cardId}>
<tr className="hover:bg-slate-50/50 transition-colors">
<td className="px-6 py-4">
<span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded-full uppercase">
{p.cardId}
</span>
</td>
<td className="px-6 py-4 font-bold text-slate-900">{p.name}</td>
<td className="px-6 py-4 text-sm text-slate-600 capitalize">{p.category}</td>
<td className="px-6 py-4 text-sm text-slate-600">{p.phone}</td>
<td className="px-6 py-4 text-sm text-slate-600">{format(new Date(p.createdAt), 'MMM d, yyyy')}</td>
<td className="px-6 py-4 text-right">
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
setSelectedPatient(p);
setShowHistory(true);
}}
className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
title="Full History"
>
<History className="w-4 h-4" />
</button>
</div>
</td>
</tr>
{expandedPatientId === p.cardId && (
<tr className="bg-slate-50">
<td colSpan={6} className="px-6 py-4">
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
{allPatients.length === 0 && (
<tr>
<td colSpan={6} className="px-6 py-20 text-center text-slate-400">
No patients found.
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
) : null}
{/* Pay / Partial Payment Modal */}
<AnimatePresence>
{payModal && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
>
<div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
<h3 className="font-bold text-slate-900">Record Payment</h3>
<button onClick={() => setPayModal(null)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
<X className="w-4 h-4" />
</button>
</div>
<div className="p-6 space-y-4">
<div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-xs font-bold text-slate-500">{payModal.item.description}</p>
<p className="text-[10px] text-slate-400 mt-1">
Balance due: ₦{payModal.item.balance.toLocaleString()}
{payModal.item.paidSoFar > 0 && ` (already paid ₦${payModal.item.paidSoFar.toLocaleString()} of ₦${payModal.item.amount.toLocaleString()})`}
</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Amount Paid (₦)</label>
<input
type="number"
autoFocus
value={payModal.amount}
onChange={e => setPayModal({ ...payModal, amount: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
placeholder="0.00"
/>
<p className="text-[10px] text-slate-400">
Defaults to the full balance. Enter a smaller amount to record a partial payment — the remaining balance stays visible until it's fully settled.
</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Payment Method</label>
<div className="grid grid-cols-2 gap-3">
<button
type="button"
onClick={() => setPayModal({ ...payModal, method: 'cash' })}
className={cn(
"flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-sm",
payModal.method === 'cash' ? "bg-blue-50 border-blue-600 text-blue-600 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
<Banknote className="w-4 h-4" /> Cash
</button>
<button
type="button"
onClick={() => setPayModal({ ...payModal, method: 'bank transfer' })}
className={cn(
"flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-sm",
payModal.method === 'bank transfer' ? "bg-blue-50 border-blue-600 text-blue-600 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
<CreditCard className="w-4 h-4" /> Transfer
</button>
</div>
</div>
<button
onClick={handleConfirmPayment}
className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
>
<Save className="w-4 h-4" />
{parseFloat(payModal.amount || '0') >= payModal.item.balance ? 'Mark as Paid' : 'Record Partial Payment'}
</button>
</div>
</motion.div>
</div>
)}
</AnimatePresence>
{/* Patient History Modal */}
<AnimatePresence>
{showHistory && selectedPatient && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
<div className="w-full max-w-5xl my-8">
<PatientHistory 
patientId={selectedPatient.cardId} 
onClose={() => setShowHistory(false)} 
/>
</div>
</div>
)}
</AnimatePresence>
{/* Print Preview Modal */}
<AnimatePresence>
{printingRecord && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
>
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="font-bold flex items-center gap-2">
<CheckCircle className="w-5 h-5 text-green-400" /> Payment Recorded
</h3>
<button onClick={() => setPrintingRecord(null)} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
<div className="p-8 text-center space-y-6">
<div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto">
<DollarSign className="w-10 h-10" />
</div>
<div>
<h4 className="text-xl font-bold text-slate-900">₦{printingRecord.paidAmount.toLocaleString()} Received</h4>
<p className="text-slate-500 text-sm mt-1">The payment has been successfully recorded.</p>
</div>
<div className="flex gap-3">
<button
onClick={() => setPrintingRecord(null)}
className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
>
Done
</button>
<button
onClick={() => handlePrint(printingRecord)}
className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
>
<Receipt className="w-5 h-5" /> Print Receipt
</button>
</div>
</div>
</motion.div>
</div>
)}
</AnimatePresence>
<ConfirmModal
isOpen={!!deleteConfirm}
title={deleteConfirm?.type === 'expense' ? "Delete Expense" : "Delete Transaction"}
message={`Are you sure you want to delete this ${deleteConfirm?.type}? This action cannot be undone.`}
confirmText="Delete"
onConfirm={() => {
if (deleteConfirm?.type === 'expense') {
handleDeleteExpense(deleteConfirm.id);
} else if (deleteConfirm?.type === 'transaction') {
handleDeleteTransaction(deleteConfirm.id);
}
setDeleteConfirm(null);
}}
onCancel={() => setDeleteConfirm(null)}
/>
</div>
);
};
