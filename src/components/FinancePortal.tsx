import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { applyPatientChange } from '../lib/patientSync';
import { supabase, handleSupabaseError, fetchAllRows } from '../lib/supabase';
import { FinancialRecord, Patient, MedicalRecord, Visit, Expense, BillingItem } from '../types';
import { toast } from 'sonner';
import { Receipt, Search, Plus, DollarSign, CreditCard, Banknote, User, CheckCircle, Clock, History, FileText, Save, X, LayoutDashboard, Wallet, ArrowUpRight, Trash2, Eraser, User as UserIcon, FileSpreadsheet, TrendingDown, TrendingUp, RotateCcw } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, parseISO } from 'date-fns';
import { Time } from './Time';
import { fmtTime } from '../lib/timeFormat';
import { cn } from '../lib/utils';
import { logAction } from '../lib/audit';
import { PatientHistory } from './PatientHistory';
import { motion, AnimatePresence } from 'motion/react';
import { useFormDraft } from '../hooks/useFormDraft';
import { ConfirmModal } from './ConfirmModal';
import { useAuth } from '../lib/auth';
// One row of the pending_bills_summary() database function: every unpaid item for a
// patient (consultation, lab tests, prescriptions, visits), whether or not any payment
// has been recorded against it yet.
interface PendingBillRow {
patientId: string;
patientName: string;
familyMemberNames: string;
itemCount: number;
totalAmount: number;
paidAmount: number;
outstanding: number;
oldestAt: string;
kinds: string;
}
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at, registrationType: r.registration_type || 'fresh',
});
const financialFromRow = (r: any): FinancialRecord => ({
id: r.id, patientId: r.patient_id, totalAmount: r.total_amount, paidAmount: r.paid_amount,
pendingAmount: r.pending_amount, paymentStatus: r.payment_status, paymentMethod: r.payment_method,
reconciled: r.reconciled, reconciledAt: r.reconciled_at, reconciledBy: r.reconciled_by,
createdAt: r.created_at, referenceType: r.reference_type, referenceId: r.reference_id,
refundReason: r.refund_reason,
receiptId: r.receipt_id,
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
section: 'patients' | 'finance' | 'reconciliation' | 'expenses' | 'reports';
}
// Refunds are stored as negative payments, so amounts can be below zero.
const money = (n: number) => `${n < 0 ? '−' : ''}₦${Math.abs(n).toLocaleString()}`;
const BILL_TYPES = ['consultation','visit','lab_test','lab_test_group','prescription','prescription_group'];
const SERVICE_LABEL: Record<string, string> = {
consultation: 'Consultation', visit: 'Visit', lab_test: 'Lab test', lab_test_group: 'Lab tests',
prescription: 'Prescription', prescription_group: 'Prescriptions', registration: 'Registration',
};
const SERVICE_RANK: Record<string, number> = { registration: 0, consultation: 1, visit: 2, lab_test_group: 3, lab_test: 3, prescription_group: 4, prescription: 4 };
// The services one combined payment covered, each with its own amount (and refund/remove actions).
const ServiceLines = ({ parts, canDelete, refundTargets, onRefund, onRemoveBill }: {
parts: FinancialRecord[],
canDelete: boolean,
refundTargets?: Map<string, number>,
onRefund?: (record: FinancialRecord & { patient?: Patient }) => void,
onRemoveBill: (record: FinancialRecord & { patient?: Patient }) => void,
}) => (
<div className="rounded-xl border border-slate-100 divide-y divide-slate-100 bg-white">
{parts.map(p => (
<div key={p.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
<div className="min-w-0">
<p className="text-sm font-semibold text-slate-800">{SERVICE_LABEL[p.referenceType || ''] || 'Service'}</p>
<p className="text-xs font-bold text-green-700">Paid ₦{p.paidAmount.toLocaleString()}</p>
</div>
<div className="flex items-center gap-1 shrink-0">
{onRefund && refundTargets?.has(p.id) && (
<button onClick={() => onRefund(p as FinancialRecord & { patient?: Patient })} className="p-2 min-w-11 min-h-11 flex items-center justify-center hover:bg-amber-100 text-amber-700 rounded-lg transition-colors" title="Refund this service" aria-label="Refund this service">
<RotateCcw className="w-4 h-4" />
</button>
)}
{canDelete && p.referenceId && BILL_TYPES.includes(p.referenceType || '') && (
<button onClick={() => onRemoveBill(p as FinancialRecord & { patient?: Patient })} className="p-2 min-w-11 min-h-11 flex items-center justify-center hover:bg-red-100 text-red-800 rounded-lg transition-colors" title="Remove this bill completely" aria-label="Remove this bill completely">
<Eraser className="w-4 h-4" />
</button>
)}
</div>
</div>
))}
</div>
);
const TransactionRow = memo(({ record, onPrint, onDelete, onRemoveBill, canDelete, canRefund, onRefund, refundTargets }: { 
record: FinancialRecord & { patient?: Patient }, 
onPrint: (record: FinancialRecord & { patient?: Patient }) => void,
onDelete: (id: string) => void,
onRemoveBill: (record: FinancialRecord & { patient?: Patient }) => void,
canDelete: boolean,
canRefund?: boolean,
onRefund?: (record: FinancialRecord & { patient?: Patient }) => void,
refundTargets?: Map<string, number>
}) => (
<tr className="hover:bg-slate-50 transition-colors group">
<td className="px-6 py-4">
<div className="flex items-center gap-3">
<div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
{record.patient?.name.charAt(0)}
</div>
<div>
<p className="text-sm font-bold text-slate-900 flex items-center gap-2">
{record.patient?.name}
{record.referenceType === 'registration' && (
<span className="text-[11px] font-bold bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full uppercase">Registration</span>
)}
</p>
<p className="text-[11px] text-slate-400">{record.patientId}</p>
{record.familyMemberName && <p className="text-[11px] font-bold text-amber-700">For: {record.familyMemberName}</p>}
{record.parts && (
<div className="mt-2"><ServiceLines parts={record.parts} canDelete={canDelete} refundTargets={refundTargets} onRefund={onRefund} onRemoveBill={onRemoveBill} /></div>
)}
</div>
</div>
</td>
<td className="px-6 py-4">
<span className="text-sm font-semibold text-slate-700">{money(record.totalAmount)}</span>
</td>
<td className="px-6 py-4">
<div className="text-xs">
<p className={cn("font-bold", record.paidAmount < 0 ? "text-purple-700" : "text-green-600")}>{money(record.paidAmount)}</p>
{record.paidAmount >= 0 && <p className="text-red-500">₦{record.pendingAmount.toLocaleString()}</p>}
{record.refundReason && <p className="text-slate-500">Reason: {record.refundReason}</p>}
</div>
</td>
<td className="px-6 py-4">
<span className={cn(
"text-[11px] font-bold px-2 py-1 rounded-full uppercase",
record.paidAmount < 0 ? "bg-purple-100 text-purple-700" : record.paymentStatus === 'fully paid' ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
)}>
{record.paidAmount < 0 ? 'refund' : record.paymentStatus}
</span>
</td>
<td className="px-6 py-4">
<div className="flex items-center gap-2">
{record.paidAmount >= 0 && (
<button
onClick={() => onPrint(record)}
className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
title="Print Receipt"
>
<Receipt className="w-4 h-4" />
</button>
)}
{canRefund && onRefund && (
<button
onClick={() => onRefund(record)}
className="p-2 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors"
title="Refund"
>
<RotateCcw className="w-4 h-4" />
</button>
)}
{canDelete && (
<button
onClick={() => onDelete(record.id)}
className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
title="Delete Transaction"
>
<Trash2 className="w-4 h-4" />
</button>
)}
{canDelete && !record.parts && record.referenceId && BILL_TYPES.includes(record.referenceType || '') && (
<button
onClick={() => onRemoveBill(record)}
className="p-2 hover:bg-red-100 text-red-800 rounded-lg transition-colors"
title="Remove bill completely (payment, bill and record)"
>
<Eraser className="w-4 h-4" />
</button>
)}
</div>
</td>
</tr>
));
// Phone layout of a transaction (same data and actions as TransactionRow, stacked as a card).
const TransactionCard = memo(({ record, onPrint, onDelete, onRemoveBill, canDelete, canRefund, onRefund, refundTargets }: {
record: FinancialRecord & { patient?: Patient },
onPrint: (record: FinancialRecord & { patient?: Patient }) => void,
onDelete: (id: string) => void,
onRemoveBill: (record: FinancialRecord & { patient?: Patient }) => void,
canDelete: boolean,
canRefund?: boolean,
onRefund?: (record: FinancialRecord & { patient?: Patient }) => void,
refundTargets?: Map<string, number>
}) => (
<div className="p-4 space-y-3">
<div className="flex items-start justify-between gap-3">
<div className="flex items-center gap-3 min-w-0">
<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0">
{record.patient?.name.charAt(0)}
</div>
<div className="min-w-0">
<p className="text-base font-bold text-slate-900 truncate">{record.patient?.name}</p>
<p className="text-xs text-slate-500">{record.patientId}</p>
{record.familyMemberName && <p className="text-xs font-bold text-amber-700">For: {record.familyMemberName}</p>}
</div>
</div>
<span className={cn(
"text-[11px] font-bold px-2.5 py-1 rounded-full uppercase shrink-0",
record.paidAmount < 0 ? "bg-purple-100 text-purple-700" : record.paymentStatus === 'fully paid' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
)}>
{record.paidAmount < 0 ? 'refund' : record.paymentStatus}
</span>
</div>
{(record.referenceType === 'registration' || record.paymentMethod) && (
<div className="flex flex-wrap items-center gap-2">
{record.referenceType === 'registration' && (
<span className="text-[11px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full uppercase">Registration</span>
)}
{record.paymentMethod && (
<span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase">{record.paymentMethod}</span>
)}
</div>
)}
{record.paidAmount < 0 ? (
<div className="bg-purple-50 rounded-xl px-3 py-2.5">
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Refunded</p>
<p className="text-lg font-black text-purple-700">{money(-record.paidAmount)}</p>
{record.refundReason && <p className="text-xs text-slate-600 mt-1">Reason: {record.refundReason}</p>}
</div>
) : (
<div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
<div>
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total</p>
<p className="text-sm font-semibold text-slate-700">₦{record.totalAmount.toLocaleString()}</p>
</div>
<div>
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Paid</p>
<p className="text-sm font-bold text-green-700">₦{record.paidAmount.toLocaleString()}</p>
</div>
<div className="text-right">
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Pending</p>
<p className="text-sm font-bold text-red-600">₦{record.pendingAmount.toLocaleString()}</p>
</div>
</div>
)}
{record.parts && <ServiceLines parts={record.parts} canDelete={canDelete} refundTargets={refundTargets} onRefund={onRefund} onRemoveBill={onRemoveBill} />}
<div className="flex gap-2">
{record.paidAmount >= 0 && (
<button
onClick={() => onPrint(record)}
className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm active:bg-blue-100"
>
<Receipt className="w-4 h-4" /> Receipt
</button>
)}
{canRefund && onRefund && (
<button
onClick={() => onRefund(record)}
className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl bg-amber-50 text-amber-800 font-bold text-sm active:bg-amber-100"
>
<RotateCcw className="w-4 h-4" /> Refund
</button>
)}
{canDelete && (
<button
onClick={() => onDelete(record.id)}
className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl bg-red-50 text-red-700 font-bold text-sm active:bg-red-100"
>
<Trash2 className="w-4 h-4" /> Delete
</button>
)}
{canDelete && !record.parts && record.referenceId && BILL_TYPES.includes(record.referenceType || '') && (
<button
onClick={() => onRemoveBill(record)}
className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl bg-red-100 text-red-900 font-bold text-sm active:bg-red-200"
>
<Eraser className="w-4 h-4" /> Remove bill
</button>
)}
</div>
</div>
));
const ExpenseRow = memo(({ expense, onDelete, canDelete }: { 
expense: Expense, 
onDelete: (id: string) => void,
onRemoveBill: (record: FinancialRecord & { patient?: Patient }) => void,
canDelete: boolean
}) => (
<tr className="hover:bg-slate-50 transition-colors">
<td className="px-6 py-4 text-sm text-slate-600">
{format(new Date(expense.createdAt), 'MMM d, yyyy')}
</td>
<td className="px-6 py-4 font-bold text-slate-900">{expense.description}</td>
<td className="px-6 py-4">
<span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full uppercase">
{expense.category}
</span>
</td>
<td className="px-6 py-4 font-bold text-red-600">₦{expense.amount.toLocaleString()}</td>
<td className="px-6 py-4 text-right">
{canDelete && (
<button
onClick={() => onDelete(expense.id)}
className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
>
<Trash2 className="w-4 h-4" />
</button>
)}
</td>
</tr>
));
export const FinancePortal: React.FC<Props> = ({ userId, section }) => {
// Only the CMD may delete payments and expenses (the database enforces this too).
const { user: authUser } = useAuth();
const canDelete = authUser?.role === 'CMD';
const [records, setRecords] = useState<(FinancialRecord & { patient?: Patient })[]>([]);
const [expenses, setExpenses] = useState<Expense[]>([]);
const [loading, setLoading] = useState(true);
const [searchId, setSearchId] = useState('');
const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
const [view, setView] = useState<'dashboard' | 'billing' | 'reconciliation' | 'patients' | 'expenses' | 'reports' | 'pendingBills'>(
section === 'finance' ? 'dashboard' : section
);
// The outer sidebar drives which section is active. 'billing' is a
// drill-in reached only by picking a patient from 'patients' - it has
// no sidebar entry of its own, so it's excluded from this sync.
useEffect(() => {
setView(section === 'finance' ? 'dashboard' : section);
setSelectedPatient(null);
}, [section]);
// Where the billing screen was opened from, so Back returns there (Pending Bills, the
// Finance dashboard, or the Patients list) instead of always dumping you on Patients.
const [billingFrom, setBillingFrom] = useState<'dashboard' | 'pendingBills' | 'patients'>('patients');
// Clicking the already-active sidebar item (e.g. Finance) sends the sidebar's "nav-reselect"
// event; go back to that section's home screen. Without this the click did nothing.
useEffect(() => {
const onReselect = (e: Event) => {
if ((e as CustomEvent<string>).detail !== 'Finance' || section !== 'finance') return;
setView('dashboard');
setSelectedPatient(null);
setBillingItems([]);
};
window.addEventListener('nav-reselect', onReselect);
return () => window.removeEventListener('nav-reselect', onReselect);
}, [section]);
const [allPatients, setAllPatients] = useState<Patient[]>([]);
const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
const [patientSearchQuery, setPatientSearchQuery] = useState('');
const [financePatientsPage, setFinancePatientsPage] = useState(1);
const FINANCE_PATIENTS_PAGE_SIZE = 50;
const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
const unpaidItems = useMemo(() => billingItems.filter(i => i.balance > 0), [billingItems]);
const [combinedModal, setCombinedModal] = useState<{ method: 'cash' | 'bank transfer'; busy: boolean; lines: { item: BillingItem; include: boolean; amount: string }[] } | null>(null);
const [pendingBills, setPendingBills] = useState<PendingBillRow[]>([]);
const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const [stats, setStats] = useState({
totalRevenue: 0,
todayRevenue: 0,
totalExpenses: 0,
netProfit: 0
});
const [showHistory, setShowHistory] = useState(false);
const [printingRecord, setPrintingRecord] = useState<(FinancialRecord & { patient?: Patient }) | null>(null);
const [removeBill, setRemoveBill] = useState<FinancialRecord | null>(null);
// Set when a CMD removes an unpaid bill from a patient's billing panel (names the bill in the confirm).
const [removeBillNote, setRemoveBillNote] = useState<string | null>(null);
const [refundModal, setRefundModal] = useState<{ record: FinancialRecord & { patient?: Patient }; net: number; amount: string; method: 'cash' | 'bank transfer'; reason: string; busy: boolean } | null>(null);
// A refund is a negative payment. A bill (or a patient's registration) can be refunded while
// the net of its payments is above zero; the button sits on its most recent payment only, so
// there is one Refund button per bill, never one per payment.
const refundTargets = useMemo(() => {
const groups = new Map<string, { net: number; latest?: (typeof records)[number] }>();
for (const r of records) {
if (!r.referenceType) continue;
const key = `${r.referenceType}:${r.referenceId ?? r.patientId}`;
const g = groups.get(key) || { net: 0 };
g.net += r.paidAmount;
if (r.paidAmount > 0 && (!g.latest || r.createdAt > g.latest.createdAt)) g.latest = r;
groups.set(key, g);
}
const out = new Map<string, number>();
groups.forEach(g => { if (g.net > 0 && g.latest) out.set(g.latest.id, g.net); });
return out;
}, [records]);
// Payments made together (one receipt) show as one entry that lists the services paid for.
const groupedRecords = useMemo(() => {
const out: (FinancialRecord & { patient?: Patient })[] = [];
const byReceipt = new Map<string, FinancialRecord & { patient?: Patient }>();
for (const r of records) {
if (!r.receiptId) { out.push(r); continue; }
const g = byReceipt.get(r.receiptId);
if (!g) {
const head = { ...r, parts: [r] as FinancialRecord[] };
byReceipt.set(r.receiptId, head);
out.push(head);
} else {
g.parts!.push(r);
g.totalAmount += r.totalAmount;
g.paidAmount += r.paidAmount;
g.pendingAmount += r.pendingAmount;
if (r.paymentStatus !== 'fully paid') g.paymentStatus = 'partially paid';
}
}
byReceipt.forEach(g => g.parts!.sort((a, b) => (SERVICE_RANK[a.referenceType || ''] ?? 9) - (SERVICE_RANK[b.referenceType || ''] ?? 9)));
return out;
}, [records]);
const [deleteConfirm, setDeleteConfirm] = useState<{type: 'expense' | 'transaction', id: string, ids?: string[]} | null>(null);
const [payModal, setPayModal] = useState<{ item: BillingItem; amount: string; method: 'cash' | 'bank transfer' } | null>(null);
const { data: expenseForm, setData: setExpenseForm, clearDraft: clearExpenseDraft } = useFormDraft('accountant_expense_form', {
description: '',
amount: '',
category: 'others' as Expense['category']
});
const fetchPendingBills = async () => {
const { data, error } = await supabase.rpc('pending_bills_summary');
if (error) { handleSupabaseError(error, 'select', 'pending_bills_summary'); return; }
setPendingBills((data || []).map((r: any) => ({
patientId: r.patient_id,
patientName: r.patient_name,
familyMemberNames: r.family_member_names || '',
itemCount: Number(r.item_count) || 0,
totalAmount: Number(r.total_amount) || 0,
paidAmount: Number(r.paid_amount) || 0,
outstanding: Number(r.outstanding) || 0,
oldestAt: r.oldest_at,
kinds: r.kinds || '',
})));
};
// Many tables feed the pending list, and one action can touch several at once, so
// refresh once after the burst instead of once per change.
const schedulePendingRefresh = () => {
if (pendingTimer.current) clearTimeout(pendingTimer.current);
pendingTimer.current = setTimeout(fetchPendingBills, 400);
};
useEffect(() => {
fetchFinancials();
fetchExpenses();
fetchAllPatients();
fetchPendingBills();
const channel = supabase
.channel('accountant-portal')
.on('postgres_changes', { event: '*', schema: 'public', table: 'financials' }, () => { fetchFinancials(); schedulePendingRefresh(); })
.on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, schedulePendingRefresh)
.on('postgres_changes', { event: '*', schema: 'public', table: 'lab_tests' }, schedulePendingRefresh)
.on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records' }, schedulePendingRefresh)
.on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, schedulePendingRefresh)
.on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchExpenses)
.on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, (payload: any) => {
setAllPatients(prev => applyPatientChange(prev, payload, patientFromRow));
})
.subscribe();
return () => {
if (pendingTimer.current) clearTimeout(pendingTimer.current);
supabase.removeChannel(channel);
};
}, []);
// Who a payment was for: the family member recorded on the consultation / lab test it paid for.
const resolveMemberNames = async (rows: any[]): Promise<Record<string, string>> => {
const out: Record<string, string> = {};
const familyRows = rows.filter(r => r.reference_id && r.patients?.category === 'family card');
const recIds = [...new Set(familyRows.filter(r => ['consultation', 'prescription_group', 'lab_test_group'].includes(r.reference_type)).map(r => r.reference_id as string))];
const labIds = [...new Set(familyRows.filter(r => r.reference_type === 'lab_test').map(r => r.reference_id as string))];
const run = async (table: string, ids: string[]) => {
for (let i = 0; i < ids.length; i += 150) {
const { data, error } = await supabase.from(table).select('id, family_members(name)')
.in('id', ids.slice(i, i + 150)).not('family_member_id', 'is', null);
if (error) { console.error(`[Supabase:${table}:member-names]`, error.message); continue; }
(data || []).forEach((d: any) => { if (d.family_members?.name) out[d.id] = d.family_members.name; });
}
};
await Promise.all([run('medical_records', recIds), run('lab_tests', labIds)]);
return out;
};
const fetchFinancials = async () => {
const { data: rows, error } = await fetchAllRows<any>('financials', q =>
q.select('*, patients(*)').order('created_at', { ascending: false })
);
if (error) {
handleSupabaseError(error, 'select', 'financials');
setLoading(false);
return;
}
const memberNames = await resolveMemberNames(rows);
const recordsWithPatients = rows.map((row: any) => ({
...financialFromRow(row),
familyMemberName: row.reference_id ? memberNames[row.reference_id] : undefined,
patient: row.patients ? patientFromRow(row.patients) : undefined,
}));
setRecords(recordsWithPatients);
const { data: expensesRows, error: expensesError } = await fetchAllRows<any>('expenses', q =>
q.select('*').order('created_at', { ascending: false })
);
if (expensesError) handleSupabaseError(expensesError, 'select', 'expenses');
const mappedExpenses = expensesRows.map(expenseFromRow);
const today = new Date().toISOString().split('T')[0];
const totalRev = recordsWithPatients.reduce((acc, r) => acc + r.paidAmount, 0);
const todayRev = recordsWithPatients.filter(r => r.createdAt.startsWith(today)).reduce((acc, r) => acc + r.paidAmount, 0);
const totalExp = mappedExpenses.reduce((acc, e) => acc + e.amount, 0);
setStats({
totalRevenue: totalRev,
todayRevenue: todayRev,
totalExpenses: totalExp,
netProfit: totalRev - totalExp,
});
setLoading(false);
};
const fetchExpenses = async () => {
const { data: rows, error } = await fetchAllRows<any>('expenses', q =>
q.select('*').order('created_at', { ascending: false })
);
if (error) return handleSupabaseError(error, 'select', 'expenses');
setExpenses(rows.map(expenseFromRow));
};
const fetchAllPatients = async () => {
const { data: rows, error } = await fetchAllRows<any>('patients', undefined, { orderBy: 'card_id' });
if (error) { handleSupabaseError(error, 'select', 'patients'); return; }
const sorted = rows.map(patientFromRow)
.sort((a, b) => a.cardId.localeCompare(b.cardId, undefined, { numeric: true, sensitivity: 'base' }));
setAllPatients(sorted);
};
// allPatients holds every patient in the clinic (6,000+) - rendering
// them all as table rows at once is what froze the Patients tab.
// Filter + paginate before they ever reach JSX, same pattern as the
// Receptionist's own Patient Directory.
const filteredFinancePatients = useMemo(() =>
allPatients.filter(p =>
p.name.toLowerCase().includes(patientSearchQuery.toLowerCase()) ||
p.cardId.includes(patientSearchQuery)
),
[allPatients, patientSearchQuery]
);
const financePatientsPageCount = Math.max(1, Math.ceil(filteredFinancePatients.length / FINANCE_PATIENTS_PAGE_SIZE));
const paginatedFinancePatients = useMemo(() => {
const start = (financePatientsPage - 1) * FINANCE_PATIENTS_PAGE_SIZE;
return filteredFinancePatients.slice(start, start + FINANCE_PATIENTS_PAGE_SIZE);
}, [filteredFinancePatients, financePatientsPage]);
useEffect(() => { setFinancePatientsPage(1); }, [patientSearchQuery, section]);
const [searchSuggestions, setSearchSuggestions] = useState<Patient[]>([]);
useEffect(() => {
if (!searchId.trim() || searchId.trim().length < 2) {
setSearchSuggestions([]);
return;
}
const timeout = setTimeout(async () => {
const { data, error } = await supabase
.from('patients')
.select('*')
.or(`name.ilike.%${searchId.trim()}%,card_id.ilike.%${searchId.trim()}%`)
.limit(8);
if (error) return handleSupabaseError(error, 'select', 'patients');
setSearchSuggestions((data || []).map(patientFromRow));
}, 250);
return () => clearTimeout(timeout);
}, [searchId]);
const openPendingBill = async (row: PendingBillRow) => {
let patient = allPatients.find(p => p.cardId === row.patientId);
if (!patient) {
const { data, error } = await supabase.from('patients').select('*').eq('card_id', row.patientId).maybeSingle();
if (error) return handleSupabaseError(error, 'select', 'patients');
if (data) patient = patientFromRow(data);
}
if (!patient) {
toast.error('Could not find that patient\'s record.');
return;
}
await selectPatientForBilling(patient);
};
const selectPatientForBilling = async (p: Patient) => {
setSearchSuggestions([]);
setSearchId('');
if (view !== 'billing') setBillingFrom(view === 'pendingBills' ? 'pendingBills' : view === 'dashboard' ? 'dashboard' : 'patients');
setSelectedPatient(p);
setView('billing');
await fetchBillingItems(p.cardId);
await logAction(userId, 'SEARCH_PATIENT_BILLING', `Selected patient ${p.name} (${p.cardId}) for billing`);
};
const handleSearch = async (e: React.FormEvent) => {
e.preventDefault();
try {
const { data: pData, error: patientErr } = await supabase.from('patients').select('*').eq('card_id', searchId).maybeSingle();
if (patientErr) throw patientErr;
if (pData) {
const patient = patientFromRow(pData);
if (view !== 'billing') setBillingFrom(view === 'pendingBills' ? 'pendingBills' : view === 'dashboard' ? 'dashboard' : 'patients');
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
const items = (data || []).map(billingItemFromRow);
// On family cards, work out whose treatment each bill is for
const { data: famData } = await supabase.from('family_members').select('id, name').eq('patient_id', patientCardId);
if (famData && famData.length > 0) {
const names: Record<string, string> = {};
famData.forEach((m: any) => { names[m.id] = m.name; });
const [{ data: recs }, { data: labs }] = await Promise.all([
supabase.from('medical_records').select('id, family_member_id').eq('patient_id', patientCardId).not('family_member_id', 'is', null),
supabase.from('lab_tests').select('id, family_member_id').eq('patient_id', patientCardId).not('family_member_id', 'is', null),
]);
const byRecord: Record<string, string> = {};
(recs || []).forEach((r: any) => { byRecord[r.id] = names[r.family_member_id]; });
const byLab: Record<string, string> = {};
(labs || []).forEach((l: any) => { byLab[l.id] = names[l.family_member_id]; });
items.forEach(it => {
const type = it.itemType as string;
it.familyMemberName = type === 'lab_test' ? byLab[it.id] : (type === 'visit' || type === 'prescription') ? undefined : byRecord[it.id];
});
}
setBillingItems(items);
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
} catch (error: any) {
const msg = String(error?.message || '');
if (msg.includes('Pharmacy must confirm')) { toast.error(msg); return; }
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
if (!canDelete) { toast.error('Only the CMD can delete expenses.'); return; }
const { data, error } = await supabase.from('expenses').delete().eq('id', id).select('id');
if (error) return handleSupabaseError(error, 'delete', 'expenses');
if (!data || data.length === 0) { toast.error('Nothing was deleted. Only the CMD can delete expenses.'); return; }
toast.success('Expense deleted');
};
const handleDeleteTransaction = async (id: string, ids?: string[]) => {
if (!canDelete) { toast.error('Only the CMD can delete transactions.'); return; }
const { data, error } = await supabase.from('financials').delete().in('id', ids && ids.length ? ids : [id]).select('id');
if (error) return handleSupabaseError(error, 'delete', 'financials');
if (!data || data.length === 0) { toast.error('Nothing was deleted. Only the CMD can delete transactions.'); return; }
await logAction(userId, 'DELETE_TRANSACTION', ids && ids.length > 1 ? `Deleted combined payment (${ids.length} services): ${ids.join(', ')}` : `Deleted transaction ${id}`);
toast.success('Transaction deleted successfully');
};
const handleRemoveBill = async (record: FinancialRecord) => {
if (!canDelete) { toast.error('Only the CMD can remove bills.'); return; }
if (!record.referenceType || !record.referenceId) return;
const { data, error } = await supabase.rpc('cmd_remove_bill', { p_item_type: record.referenceType, p_item_id: record.referenceId });
if (error) { toast.error(error.message || 'Could not remove the bill.'); return; }
const r: any = data || {};
toast.success(`Removed: ${r.payments_removed ?? 0} payment(s), ${r.records_removed ?? 0} record(s)`);
setRecords(prev => prev.filter(x => !(x.referenceType === record.referenceType && x.referenceId === record.referenceId)));
// The bill may have been removed from a patient's billing panel (e.g. opened from Pending Bills).
if (selectedPatient) fetchBillingItems(selectedPatient.cardId);
fetchPendingBills();
};
const openCombined = () => {
const lines = [...unpaidItems]
.sort((a, b) => (SERVICE_RANK[a.itemType] ?? 9) - (SERVICE_RANK[b.itemType] ?? 9) || a.createdAt.localeCompare(b.createdAt))
.map(item => ({ item, include: true, amount: String(item.balance) }));
setCombinedModal({ method: 'cash', busy: false, lines });
};
const setCombinedLine = (i: number, patch: Partial<{ include: boolean; amount: string }>) =>
setCombinedModal(m => (m ? { ...m, lines: m.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : m));
const combinedTotal = combinedModal
? combinedModal.lines.reduce((sum, l) => sum + (l.include ? (parseFloat(l.amount) || 0) : 0), 0)
: 0;
const handleConfirmCombined = async () => {
if (!combinedModal || combinedModal.busy || !selectedPatient) return;
const chosen = combinedModal.lines.filter(l => l.include);
if (chosen.length === 0) { toast.error('Choose at least one service.'); return; }
for (const l of chosen) {
const a = parseFloat(l.amount);
const name = SERVICE_LABEL[l.item.itemType] || 'Service';
if (!a || a <= 0) { toast.error(`Enter an amount for ${name}.`); return; }
if (a > l.item.balance) { toast.error(`${name}: amount cannot exceed its balance of ₦${l.item.balance.toLocaleString()}.`); return; }
}
setCombinedModal({ ...combinedModal, busy: true });
const { data, error } = await supabase.rpc('record_combined_payment', {
p_patient_id: selectedPatient.cardId,
p_payment_method: combinedModal.method,
p_lines: chosen.map(l => ({ item_type: l.item.itemType, item_id: l.item.id, amount: parseFloat(l.amount) })),
});
if (error) {
toast.error(error.message || 'Could not record the payment.');
setCombinedModal(m => (m ? { ...m, busy: false } : m));
return;
}
const res: any = data || {};
const now = new Date().toISOString();
const parts: FinancialRecord[] = chosen.map(l => {
const paid = parseFloat(l.amount);
const left = Math.max(l.item.balance - paid, 0);
return {
id: `${res.receipt_id}-${l.item.id}`, patientId: selectedPatient.cardId, totalAmount: l.item.amount, paidAmount: paid,
pendingAmount: left, paymentStatus: left > 0 ? 'partially paid' : 'fully paid', paymentMethod: combinedModal.method,
createdAt: now, referenceType: l.item.itemType, referenceId: l.item.id,
};
});
setPrintingRecord({
id: res.receipt_id, receiptId: res.receipt_id, patientId: selectedPatient.cardId,
totalAmount: parts.reduce((s, p) => s + p.totalAmount, 0),
paidAmount: parts.reduce((s, p) => s + p.paidAmount, 0),
pendingAmount: parts.reduce((s, p) => s + p.pendingAmount, 0),
paymentStatus: parts.some(p => p.paymentStatus !== 'fully paid') ? 'partially paid' : 'fully paid',
paymentMethod: combinedModal.method, createdAt: now, parts, patient: selectedPatient,
} as FinancialRecord & { patient: Patient });
toast.success(`Recorded ₦${Number(res.total ?? 0).toLocaleString()} for ${res.services ?? chosen.length} service(s)`);
setCombinedModal(null);
await fetchBillingItems(selectedPatient.cardId);
fetchFinancials();
fetchPendingBills();
};
const openRefund = (record: FinancialRecord & { patient?: Patient }) => {
const net = refundTargets.get(record.id);
if (!net) return;
setRefundModal({ record, net, amount: String(net), method: record.paymentMethod === 'bank transfer' ? 'bank transfer' : 'cash', reason: '', busy: false });
};
const handleConfirmRefund = async () => {
if (!refundModal || refundModal.busy) return;
const { record, net, amount, method, reason } = refundModal;
const amt = parseFloat(amount);
if (!amt || amt <= 0) { toast.error('Enter the amount to refund.'); return; }
if (amt > net) { toast.error(`You can refund at most ₦${net.toLocaleString()} on this bill.`); return; }
if (reason.trim().length < 3) { toast.error('Give a reason for the refund.'); return; }
setRefundModal({ ...refundModal, busy: true });
const { error } = await supabase.rpc('record_item_refund', {
p_item_type: record.referenceType,
p_item_id: record.referenceId ?? null,
p_patient_id: record.patientId,
p_amount: amt,
p_payment_method: method,
p_reason: reason.trim(),
});
if (error) {
toast.error(error.message || 'Could not record the refund.');
setRefundModal(m => (m ? { ...m, busy: false } : m));
return;
}
toast.success(`Refunded ₦${amt.toLocaleString()}`);
setRefundModal(null);
fetchFinancials();
fetchPendingBills();
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
// Built for a 58 mm thermal roll (Xprinter XP-58IIH: 48 mm / 384 dots printable).
// Pure black, bold, large type and thick rules, because thermal heads turn grey text,
// thin lines, tilted or coloured elements into faint, fuzzy dots.
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const naira = (n: number) => '₦' + Number(n || 0).toLocaleString();
const owing = record.pendingAmount > 0;
const descHtml = record.parts && record.parts.length
? '<div class="field"><div class="lbl">Services paid</div></div>' + record.parts.map(p => `<div class="line"><span class="k">${esc(SERVICE_LABEL[p.referenceType || ''] || 'Service')}</span><span class="v">${naira(p.paidAmount)}</span></div>`).join('')
: '<div class="field"><div class="lbl">Description</div><div class="val">Hospital Services / Clinical Fees</div></div>';
const content = `
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment Receipt - ${esc(record.patient?.name || record.patientId)}</title>
<style>
@page { size: 58mm auto; margin: 0; }
* { box-sizing: border-box; color: #000 !important; background: #fff !important; }
html, body { margin: 0; padding: 0; }
body { width: 48mm; margin: 0 auto; padding: 2mm 0 6mm; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.3; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.center { text-align: center; }
.clinic { font-size: 17px; font-weight: 900; line-height: 1.2; }
.title { font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2mm; }
.rule { border: 0; border-top: 2px dashed #000; margin: 2.5mm 0; }
.solid { border-top: 3px solid #000; }
.field { margin: 1.5mm 0; }
.lbl { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.val { font-size: 15px; font-weight: 900; word-break: break-word; }
.small { font-size: 12px; font-weight: 700; word-break: break-all; }
.line { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; margin: 1.5mm 0; }
.line .k { font-size: 14px; font-weight: 700; }
.line .v { font-size: 16px; font-weight: 900; white-space: nowrap; }
.big .k { font-size: 15px; font-weight: 900; }
.big .v { font-size: 18px; font-weight: 900; }
.status { margin: 3mm auto 0; text-align: center; border: 3px solid #000; padding: 1.5mm 1mm; font-size: 17px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
.foot { margin-top: 3mm; text-align: center; font-size: 12px; font-weight: 700; line-height: 1.3; }
@media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="center">
<div class="clinic">The Rehoboth Clinic and Maternity, Mopa</div>
<div class="title">Official Payment Receipt</div>
</div>
<hr class="rule" />
<div class="field"><div class="lbl">Receipt No</div><div class="small">${esc(record.receiptId || record.id || 'TEMP-' + Date.now())}</div></div>
<div class="field"><div class="lbl">Date</div><div class="val">${esc(fmtTime(record.createdAt, 'MMM d, yyyy HH:mm'))}</div></div>
<div class="field"><div class="lbl">Patient</div><div class="val">${esc(record.patient?.name || 'N/A')}</div></div>
<div class="field"><div class="lbl">Card ID</div><div class="val">${esc(record.patientId)}</div></div>
<hr class="rule" />
${descHtml}
<hr class="rule solid" />
<div class="line"><span class="k">Total</span><span class="v">${naira(record.totalAmount)}</span></div>
<div class="line big"><span class="k">Paid</span><span class="v">${naira(record.paidAmount)}</span></div>
<div class="line"><span class="k">${owing ? 'BALANCE DUE' : 'Balance'}</span><span class="v">${naira(record.pendingAmount)}</span></div>
<hr class="rule solid" />
<div class="line"><span class="k">Mode</span><span class="v" style="text-transform: capitalize;">${esc(record.paymentMethod)}</span></div>
<div class="status">${owing ? 'PART PAYMENT' : 'PAID IN FULL'}</div>
<hr class="rule" />
<div class="foot">
<div>Thank you for choosing Rehoboth Mopa Hospital.</div>
<div style="margin-top:1.5mm;">Computer-generated receipt. No signature needed.</div>
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
{/* The header already names the section; only a title that adds information is shown. */}
{((view === 'billing' && selectedPatient) || view === 'pendingBills') && (
<h2 className="text-3xl font-bold text-slate-900">
{view === 'billing' && selectedPatient ? selectedPatient.name : 'Pending Bills'}
</h2>
)}
<p className="text-slate-500">
{view === 'billing' && selectedPatient ? `Card ID: ${selectedPatient.cardId}` :
view === 'pendingBills' ? 'Tap a patient to open their billing and take payment.' :
'Manage patient billing and payments.'}
</p>
</div>
<div className="flex flex-wrap gap-2">
{view === 'billing' && (
<>
<button
onClick={() => { setView(billingFrom); setSelectedPatient(null); setBillingItems([]); if (billingFrom === 'pendingBills') fetchPendingBills(); }}
className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
>
← Back to {billingFrom === 'pendingBills' ? 'Pending Bills' : billingFrom === 'dashboard' ? 'Dashboard' : 'Patients'}
</button>
{billingFrom !== 'dashboard' && section === 'finance' && (
<button
onClick={() => { setView('dashboard'); setSelectedPatient(null); setBillingItems([]); }}
className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
>
Finance Dashboard
</button>
)}
</>
)}
{view === 'pendingBills' && (
<button
onClick={() => setView('dashboard')}
className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
>
← Back to Dashboard
</button>
)}
<form onSubmit={handleSearch} className="flex gap-2">
<div className="relative">
<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
<input
value={searchId}
onChange={e => setSearchId(e.target.value)}
className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none w-48 sm:w-64"
placeholder="Search by name or Card ID"
/>
{searchSuggestions.length > 0 && (
<div className="absolute z-20 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
{searchSuggestions.map(p => (
<button
key={p.cardId}
type="button"
onClick={() => selectPatientForBilling(p)}
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
<button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all">
Search
</button>
</form>
</div>
</div>
{view === 'dashboard' ? (
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
<div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6">
<div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
<Wallet className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.totalRevenue.toLocaleString()}</h4>
</div>
</div>
<div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6">
<div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
<ArrowUpRight className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Today's Collection</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.todayRevenue.toLocaleString()}</h4>
</div>
</div>
<button
type="button"
onClick={() => setView('pendingBills')}
className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6 text-left hover:border-orange-200 hover:shadow-md transition-all"
>
<div className="w-16 h-16 shrink-0 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600">
<Receipt className="w-8 h-8" />
</div>
<div className="min-w-0">
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pending Bills</p>
<h4 className="text-3xl font-black text-slate-900">{pendingBills.length}</h4>
<p className="text-xs text-slate-400 mt-0.5">{pendingBills.length === 1 ? 'patient owing' : 'patients owing'}</p>
</div>
</button>
<div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6">
<div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-600">
<TrendingDown className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Expenses</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.totalExpenses.toLocaleString()}</h4>
</div>
</div>
<div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 sm:gap-6">
<div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600">
<TrendingUp className="w-8 h-8" />
</div>
<div>
<p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Net Profit</p>
<h4 className="text-3xl font-black text-slate-900">₦{stats.netProfit.toLocaleString()}</h4>
</div>
</div>
<div className="md:col-span-3 bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100">
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
<p className={cn("font-bold", record.paidAmount < 0 ? "text-purple-700" : "text-slate-900")}>{money(record.paidAmount)}</p>
<p className="text-xs text-slate-500">Patient: {record.patient?.name || record.patientId}</p>
{record.familyMemberName && <p className="text-[11px] font-bold text-amber-700">For: {record.familyMemberName}</p>}
</div>
</div>
<div className="text-right">
<span className="text-[11px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase">
{record.paymentMethod}
</span>
<p className="text-[11px] text-slate-400 mt-1"><Time value={record.createdAt} pattern="MMM d, HH:mm" /></p>
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
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8">
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
{unpaidItems.length >= 2 && (
<div className="p-4 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between gap-3">
<div className="min-w-0">
<p className="text-sm font-bold text-slate-900">{unpaidItems.length} services unpaid</p>
<p className="text-xs text-slate-500">Owing ₦{unpaidItems.reduce((s, i) => s + i.balance, 0).toLocaleString()} in total</p>
</div>
<button
onClick={openCombined}
className="shrink-0 min-h-11 px-4 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all flex items-center gap-2"
>
<Wallet className="w-4 h-4" /> Pay together
</button>
</div>
)}
<div className="divide-y divide-slate-100">
{billingItems.length === 0 ? (
<p className="text-center text-slate-400 text-sm py-12">No billable items found for this patient.</p>
) : (
billingItems.map((item) => (
<div key={`${item.itemType}-${item.id}`} className="p-4 flex items-center justify-between gap-4">
<div className="min-w-0 flex-1">
<p className="text-sm font-bold text-slate-900 truncate">{item.description}</p>
{item.familyMemberName && <p className="text-[11px] font-bold text-amber-700">For: {item.familyMemberName}</p>}
<div className="flex items-center gap-2 mt-1">
<span className={cn(
"text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
item.paymentStatus === 'paid' && "bg-green-50 text-green-600 border-green-100",
item.paymentStatus === 'partial' && "bg-blue-50 text-blue-600 border-blue-100",
item.paymentStatus === 'pending' && "bg-orange-50 text-orange-600 border-orange-100",
)}>
{item.paymentStatus}
</span>
<span className="text-[11px] text-slate-400">{format(new Date(item.createdAt), 'MMM d, yyyy')}</span>
</div>
</div>
<div className="text-right">
<p className="text-sm font-black text-slate-900">₦{item.amount.toLocaleString()}</p>
{item.paidSoFar > 0 && item.balance > 0 && (
<p className="text-[11px] text-slate-400">Paid ₦{item.paidSoFar.toLocaleString()} · Owes ₦{item.balance.toLocaleString()}</p>
)}
</div>
<div className="flex items-center gap-1 shrink-0">
{item.balance > 0 ? (
<button
onClick={() => setPayModal({ item, amount: item.balance.toString(), method: 'cash' })}
className="min-h-11 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all"
>
Pay
</button>
) : (
<CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
)}
{canDelete && item.balance > 0 && item.paidSoFar === 0 && (
<button
onClick={() => {
setRemoveBillNote(`${SERVICE_LABEL[item.itemType] || 'Bill'}: ${item.description} (₦${item.amount.toLocaleString()})`);
setRemoveBill({ referenceType: item.itemType, referenceId: item.id, patientId: selectedPatient?.cardId || '' } as FinancialRecord);
}}
className="min-w-11 min-h-11 flex items-center justify-center hover:bg-red-100 text-red-800 rounded-lg transition-colors"
title="Remove this unpaid bill"
aria-label="Remove this unpaid bill"
>
<Eraser className="w-4 h-4" />
</button>
)}
</div>
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
<div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<History className="w-5 h-5 text-slate-400" /> Recent Transactions
</h3>
</div>
{/* Phone: stacked cards */}
<div className="divide-y divide-slate-100 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 md:gap-4 md:p-4 md:divide-y-0 md:[&>*:not(p)]:rounded-2xl md:[&>*:not(p)]:border md:[&>*:not(p)]:border-slate-200 md:[&>*:not(p)]:bg-white md:[&>*:not(p)]:shadow-sm md:[&>p]:col-span-full">
{groupedRecords.map((record, idx) => (
<TransactionCard
key={record.id || idx}
record={record}
canDelete={canDelete}
onPrint={handlePrint}
onDelete={() => setDeleteConfirm({ type: 'transaction', id: record.id, ids: record.parts?.map(p => p.id) })}
onRemoveBill={(r) => setRemoveBill(r)}
canRefund={!record.parts && refundTargets.has(record.id)}
onRefund={openRefund}
refundTargets={refundTargets}
/>
))}
{records.length === 0 && !loading && (
<p className="px-6 py-16 text-center text-slate-500">No transactions found.</p>
)}
</div>
{/* Tablet and desktop: table */}
<div className="hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Patient</th>
<th className="px-6 py-4">Amount</th>
<th className="px-6 py-4">Paid/Pending</th>
<th className="px-6 py-4">Status</th>
<th className="px-6 py-4">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{groupedRecords.map((record, idx) => (
<TransactionRow 
key={record.id || idx} 
record={record} 
canDelete={canDelete}
onPrint={handlePrint}
onDelete={() => setDeleteConfirm({ type: 'transaction', id: record.id, ids: record.parts?.map(p => p.id) })}
onRemoveBill={(r) => setRemoveBill(r)}
canRefund={!record.parts && refundTargets.has(record.id)}
onRefund={openRefund}
refundTargets={refundTargets}
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
{/* Phone: stacked cards */}
<div className="divide-y divide-slate-100 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 md:gap-4 md:p-4 md:divide-y-0 md:[&>*:not(p)]:rounded-2xl md:[&>*:not(p)]:border md:[&>*:not(p)]:border-slate-200 md:[&>*:not(p)]:bg-white md:[&>*:not(p)]:shadow-sm md:[&>p]:col-span-full">
{records.filter(r => r.paymentMethod === 'bank transfer').map((record, idx) => (
<div key={record.id || idx} className="p-4 space-y-3">
<div className="flex items-start justify-between gap-3">
<div className="min-w-0">
<p className="text-base font-bold text-slate-900 truncate">{record.patient?.name}</p>
<p className="text-xs text-slate-500">{record.patientId}</p>
<p className="text-xs text-slate-500"><Time value={record.createdAt} pattern="MMM d, yyyy HH:mm" /></p>
</div>
{record.reconciled ? (
<span className="text-[11px] font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full uppercase flex items-center gap-1 shrink-0">
<CheckCircle className="w-3.5 h-3.5" /> Reconciled
</span>
) : (
<span className="text-[11px] font-bold bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full uppercase flex items-center gap-1 shrink-0">
<Clock className="w-3.5 h-3.5" /> Pending
</span>
)}
</div>
<p className="text-lg font-black text-slate-900">{money(record.paidAmount)}</p>
{!record.reconciled && (
<button
onClick={() => handleReconcile(record.id)}
className="w-full min-h-11 bg-blue-600 text-white rounded-xl text-sm font-bold active:bg-blue-700"
>
Mark Reconciled
</button>
)}
</div>
))}
{records.filter(r => r.paymentMethod === 'bank transfer').length === 0 && !loading && (
<p className="px-6 py-16 text-center text-slate-500">No bank transfers found.</p>
)}
</div>
{/* Tablet and desktop: table */}
<div className="hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
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
<Time value={record.createdAt} pattern="MMM d, yyyy HH:mm" />
</td>
<td className="px-6 py-4">
<p className="text-sm font-bold text-slate-900">{record.patient?.name}</p>
<p className="text-[11px] text-slate-400">{record.patientId}</p>
</td>
<td className="px-6 py-4">
<p className="text-sm font-bold text-slate-900">{money(record.paidAmount)}</p>
</td>
<td className="px-6 py-4">
<span className="text-[11px] font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded-full uppercase">
{record.paymentMethod}
</span>
</td>
<td className="px-6 py-4">
{record.reconciled ? (
<span className="text-[11px] font-bold bg-green-100 text-green-600 px-2 py-1 rounded-full uppercase flex items-center gap-1 w-fit">
<CheckCircle className="w-3 h-3" /> Reconciled
</span>
) : (
<span className="text-[11px] font-bold bg-orange-100 text-orange-600 px-2 py-1 rounded-full uppercase flex items-center gap-1 w-fit">
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
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8">
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
{/* Phone: stacked cards */}
<div className="divide-y divide-slate-100 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 md:gap-4 md:p-4 md:divide-y-0 md:[&>*:not(p)]:rounded-2xl md:[&>*:not(p)]:border md:[&>*:not(p)]:border-slate-200 md:[&>*:not(p)]:bg-white md:[&>*:not(p)]:shadow-sm md:[&>p]:col-span-full">
{expenses.map((expense, idx) => (
<div key={expense.id || idx} className="p-4 flex items-start justify-between gap-3">
<div className="min-w-0 space-y-1">
<p className="text-base font-bold text-slate-900">{expense.description}</p>
<div className="flex flex-wrap items-center gap-2">
<span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase">{expense.category}</span>
<span className="text-xs text-slate-500">{format(new Date(expense.createdAt), 'MMM d, yyyy')}</span>
</div>
<p className="text-lg font-black text-red-600">₦{expense.amount.toLocaleString()}</p>
</div>
{canDelete && (
<button
onClick={() => setDeleteConfirm({ type: 'expense', id: expense.id })}
aria-label="Delete expense"
className="p-3 rounded-xl bg-red-50 text-red-700 active:bg-red-100 shrink-0"
>
<Trash2 className="w-5 h-5" />
</button>
)}
</div>
))}
{expenses.length === 0 && (
<p className="px-6 py-16 text-center text-slate-500">No expenses recorded.</p>
)}
</div>
{/* Tablet and desktop: table */}
<div className="hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
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
canDelete={canDelete}
expense={expense} 
onDelete={(id) => setDeleteConfirm({ type: 'expense', id })}
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
<div className="p-5 sm:p-8 rounded-3xl bg-blue-600 text-white space-y-6 shadow-2xl shadow-blue-200">
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
onClick={async () => {
try {
const { generateFinancialReport } = await import('../lib/excel');
generateFinancialReport({ income: records, expenses });
} catch (error) {
toast.error('Could not generate the spreadsheet. Please try again.');
}
}}
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
<div className="overflow-x-auto scroll-thin table-scroll [&_table]:block [&_thead]:hidden [&_tbody]:block [&_tr]:block [&_tr]:p-4 [&_tr]:border-b [&_tr]:border-slate-100 [&_td]:block [&_td]:!px-0 [&_td]:!py-1 [&_td:empty]:hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Card ID</th>
<th className="px-6 py-4">Name</th>
<th className="px-6 py-4">Category</th>
<th className="px-6 py-4">Phone</th>
<th className="px-6 py-4">Registered</th>
<th className="px-6 py-4 text-right">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{paginatedFinancePatients.map((p) => (
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
{filteredFinancePatients.length === 0 && (
<tr>
<td colSpan={6} className="px-6 py-20 text-center text-slate-400">
No patients found.
</td>
</tr>
)}
</tbody>
</table>
</div>
{filteredFinancePatients.length > 0 && (
<div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm text-slate-500">
<span>
Showing {(financePatientsPage - 1) * FINANCE_PATIENTS_PAGE_SIZE + 1}
{'-'}
{Math.min(financePatientsPage * FINANCE_PATIENTS_PAGE_SIZE, filteredFinancePatients.length)} of {filteredFinancePatients.length}
</span>
<div className="flex items-center gap-2">
<button
type="button"
onClick={() => setFinancePatientsPage(p => Math.max(1, p - 1))}
disabled={financePatientsPage === 1}
className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
>
Prev
</button>
<span className="font-semibold text-slate-600">Page {financePatientsPage} of {financePatientsPageCount}</span>
<button
type="button"
onClick={() => setFinancePatientsPage(p => Math.min(financePatientsPageCount, p + 1))}
disabled={financePatientsPage === financePatientsPageCount}
className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
>
Next
</button>
</div>
</div>
)}
</div>
) : view === 'pendingBills' ? (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<Receipt className="w-5 h-5 text-orange-500" /> Patients With Pending Bills
</h3>
</div>
{/* Phone: one tappable card per patient */}
<div className="divide-y divide-slate-100 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 md:gap-4 md:p-4 md:divide-y-0 md:[&>*:not(p)]:rounded-2xl md:[&>*:not(p)]:border md:[&>*:not(p)]:border-slate-200 md:[&>*:not(p)]:bg-white md:[&>*:not(p)]:shadow-sm md:[&>p]:col-span-full">
{pendingBills.map(row => (
<button
key={row.patientId}
type="button"
onClick={() => openPendingBill(row)}
className="w-full text-left p-4 flex flex-col gap-3 active:bg-orange-50 hover:bg-orange-50/60 transition-colors"
>
<div className="flex items-start justify-between gap-3">
<div className="flex items-center gap-3 min-w-0">
<div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold shrink-0">
{row.patientName?.charAt(0) || '?'}
</div>
<div className="min-w-0">
<p className="text-base font-bold text-slate-900 truncate">{row.patientName || row.patientId}</p>
<p className="text-xs text-slate-500">{row.patientId}</p>
{row.familyMemberNames && <p className="text-xs font-bold text-amber-700">For: {row.familyMemberNames}</p>}
</div>
</div>
<span className="text-[11px] font-bold px-2.5 py-1 rounded-full uppercase bg-orange-100 text-orange-700 shrink-0">
{row.paidAmount > 0 ? 'partial' : 'pending'}
</span>
</div>
<p className="text-sm text-slate-600">
{row.kinds} · {row.itemCount} unpaid item{row.itemCount === 1 ? '' : 's'}
</p>
<div className="flex items-end justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
<div>
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total</p>
<p className="text-sm font-semibold text-slate-700">₦{row.totalAmount.toLocaleString()}</p>
</div>
<div className="text-right">
<p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Pending</p>
<p className="text-lg font-black text-red-600">₦{row.outstanding.toLocaleString()}</p>
</div>
</div>
</button>
))}
{pendingBills.length === 0 && (
<p className="px-6 py-16 text-center text-slate-500">No pending bills right now.</p>
)}
</div>
{/* Tablet and desktop: table */}
<div className="hidden">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4">Patient</th>
<th className="px-6 py-4">Unpaid</th>
<th className="px-6 py-4">Total</th>
<th className="px-6 py-4">Pending</th>
<th className="px-6 py-4">Status</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{pendingBills.map(row => (
<tr
key={row.patientId}
onClick={() => openPendingBill(row)}
className="hover:bg-orange-50/60 cursor-pointer transition-colors"
>
<td className="px-6 py-4">
<div className="flex items-center gap-3">
<div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-xs">
{row.patientName?.charAt(0) || '?'}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{row.patientName || row.patientId}</p>
<p className="text-[11px] text-slate-400">{row.patientId}</p>
{row.familyMemberNames && <p className="text-[11px] font-bold text-amber-700">For: {row.familyMemberNames}</p>}
</div>
</div>
</td>
<td className="px-6 py-4">
<p className="text-sm font-semibold text-slate-700">{row.kinds}</p>
<p className="text-[11px] text-slate-400">{row.itemCount} unpaid item{row.itemCount === 1 ? '' : 's'}</p>
</td>
<td className="px-6 py-4 text-sm font-semibold text-slate-700">₦{row.totalAmount.toLocaleString()}</td>
<td className="px-6 py-4 text-sm font-bold text-red-500">₦{row.outstanding.toLocaleString()}</td>
<td className="px-6 py-4">
<span className="text-[11px] font-bold px-2 py-1 rounded-full uppercase bg-orange-100 text-orange-600">
{row.paidAmount > 0 ? 'partial' : 'pending'}
</span>
</td>
</tr>
))}
{pendingBills.length === 0 && (
<tr>
<td colSpan={5} className="px-6 py-20 text-center text-slate-400">
No pending bills right now.
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
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[92dvh] overflow-y-auto pb-safe"
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
{payModal.item.familyMemberName && <p className="text-xs font-bold text-amber-700">For: {payModal.item.familyMemberName}</p>}
<p className="text-[11px] text-slate-400 mt-1">
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
<p className="text-[11px] text-slate-400">
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
{/* Pay Together Modal */}
<AnimatePresence>
{combinedModal && (
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] overflow-y-auto pb-safe"
>
<div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
<div>
<h3 className="font-bold text-slate-900">Pay Together</h3>
<p className="text-xs text-slate-500">{selectedPatient?.name} · {selectedPatient?.cardId}</p>
</div>
<button onClick={() => setCombinedModal(null)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors" aria-label="Close">
<X className="w-4 h-4" />
</button>
</div>
<div className="p-5 space-y-4">
<p className="text-xs text-slate-500">Untick a service to leave it unpaid. Change an amount to pay part of a service; the rest stays owing.</p>
<div className="space-y-2">
{combinedModal.lines.map((l, i) => (
<div key={`${l.item.itemType}-${l.item.id}`} className={cn("p-3 rounded-xl border", l.include ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white opacity-70")}>
<label className="flex items-start gap-3 min-h-11 cursor-pointer">
<input
type="checkbox"
checked={l.include}
onChange={e => setCombinedLine(i, { include: e.target.checked })}
className="mt-1 w-5 h-5 accent-blue-600 shrink-0"
/>
<div className="min-w-0 flex-1">
<p className="text-sm font-bold text-slate-900">{SERVICE_LABEL[l.item.itemType] || 'Service'}</p>
<p className="text-xs text-slate-500 break-words">{l.item.description}</p>
{l.item.familyMemberName && <p className="text-xs font-bold text-amber-700">For: {l.item.familyMemberName}</p>}
<p className="text-[11px] text-slate-400 mt-0.5">
Balance ₦{l.item.balance.toLocaleString()}
{l.item.paidSoFar > 0 && ` (paid ₦${l.item.paidSoFar.toLocaleString()} of ₦${l.item.amount.toLocaleString()})`}
</p>
</div>
</label>
{l.include && (
<div className="mt-2 flex items-center gap-2 pl-8">
<span className="text-sm font-bold text-slate-500">₦</span>
<input
type="number"
inputMode="decimal"
value={l.amount}
onChange={e => setCombinedLine(i, { amount: e.target.value })}
className="flex-1 min-w-0 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
placeholder="0.00"
aria-label={`Amount for ${SERVICE_LABEL[l.item.itemType] || 'service'}`}
/>
<button
type="button"
onClick={() => setCombinedLine(i, { amount: String(l.item.balance) })}
className="min-h-11 px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg"
>
Full
</button>
</div>
)}
</div>
))}
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Payment Method</label>
<div className="grid grid-cols-2 gap-3">
<button
type="button"
onClick={() => setCombinedModal({ ...combinedModal, method: 'cash' })}
className={cn(
"flex items-center justify-center gap-2 p-3 min-h-11 rounded-xl border transition-all text-sm",
combinedModal.method === 'cash' ? "bg-blue-50 border-blue-600 text-blue-600 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
<Banknote className="w-4 h-4" /> Cash
</button>
<button
type="button"
onClick={() => setCombinedModal({ ...combinedModal, method: 'bank transfer' })}
className={cn(
"flex items-center justify-center gap-2 p-3 min-h-11 rounded-xl border transition-all text-sm",
combinedModal.method === 'bank transfer' ? "bg-blue-50 border-blue-600 text-blue-600 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
<CreditCard className="w-4 h-4" /> Transfer
</button>
</div>
</div>
<button
onClick={handleConfirmCombined}
disabled={combinedModal.busy || combinedTotal <= 0}
className="w-full min-h-12 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
>
<Save className="w-4 h-4" />
{combinedModal.busy ? 'Recording...' : `Pay ₦${combinedTotal.toLocaleString()}`}
</button>
</div>
</motion.div>
</div>
)}
</AnimatePresence>
{/* Refund Modal */}
<AnimatePresence>
{refundModal && (
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[92dvh] overflow-y-auto pb-safe"
>
<div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
<h3 className="font-bold text-slate-900">Refund Payment</h3>
<button onClick={() => setRefundModal(null)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors" aria-label="Close">
<X className="w-4 h-4" />
</button>
</div>
<div className="p-6 space-y-4">
<div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
<p className="text-xs font-bold text-slate-500">{refundModal.record.patient?.name} · {refundModal.record.patientId}</p>
<p className="text-xs text-slate-500 capitalize">{(refundModal.record.referenceType || '').replace(/_/g, ' ')}</p>
<p className="text-[11px] text-slate-400 mt-1">Paid on this bill: ₦{refundModal.net.toLocaleString()}</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Amount to Refund (₦)</label>
<input
type="number"
autoFocus
value={refundModal.amount}
onChange={e => setRefundModal({ ...refundModal, amount: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg"
placeholder="0.00"
/>
<p className="text-[11px] text-slate-400">Defaults to everything paid. Enter less for a partial refund; the refunded amount becomes unpaid again on the bill.</p>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Refunded By</label>
<div className="grid grid-cols-2 gap-3">
<button
type="button"
onClick={() => setRefundModal({ ...refundModal, method: 'cash' })}
className={cn(
"flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-sm",
refundModal.method === 'cash' ? "bg-amber-50 border-amber-600 text-amber-800 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
<Banknote className="w-4 h-4" /> Cash
</button>
<button
type="button"
onClick={() => setRefundModal({ ...refundModal, method: 'bank transfer' })}
className={cn(
"flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-sm",
refundModal.method === 'bank transfer' ? "bg-amber-50 border-amber-600 text-amber-800 font-bold shadow-sm" : "border-slate-200 text-slate-500"
)}
>
<CreditCard className="w-4 h-4" /> Transfer
</button>
</div>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700">Reason (required)</label>
<textarea
rows={2}
value={refundModal.reason}
onChange={e => setRefundModal({ ...refundModal, reason: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
placeholder="e.g. Test cancelled before sample was taken"
/>
</div>
<p className="text-[11px] text-slate-400">Not possible once the drug is dispensed or the lab result is entered. Recorded in the audit log.</p>
<button
onClick={handleConfirmRefund}
disabled={refundModal.busy}
className="w-full bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
>
<RotateCcw className="w-4 h-4" />
{refundModal.busy ? 'Refunding...' : `Refund ₦${(parseFloat(refundModal.amount) || 0).toLocaleString()}`}
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
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] overflow-y-auto pb-safe"
>
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="font-bold flex items-center gap-2">
<CheckCircle className="w-5 h-5 text-green-400" /> Payment Recorded
</h3>
<button onClick={() => setPrintingRecord(null)} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
<div className="p-5 sm:p-8 text-center space-y-6">
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
isOpen={!!removeBill}
title="Remove bill completely"
message={removeBillNote ? `Remove ${removeBillNote}? Nothing has been paid on it. This permanently deletes the bill and the ${removeBill?.referenceType === 'visit' ? 'visit' : removeBill?.referenceType === 'consultation' ? 'consultation (diagnosis) record' : removeBill?.referenceType?.startsWith('lab') ? 'lab test record(s)' : 'prescription record(s)'} it belongs to. This cannot be undone.` : `This permanently deletes the ${removeBill?.referenceType?.replace(/_/g,' ')} bill, ALL its payments, and the ${removeBill?.referenceType === 'visit' ? 'visit' : removeBill?.referenceType === 'consultation' ? 'consultation (diagnosis) record' : removeBill?.referenceType?.startsWith('lab') ? 'lab test record(s)' : 'prescription record(s)'} it belongs to. This cannot be undone.`}
confirmText="Remove completely"
onConfirm={() => { if (removeBill) handleRemoveBill(removeBill); setRemoveBill(null); setRemoveBillNote(null); }}
onCancel={() => { setRemoveBill(null); setRemoveBillNote(null); }}
/>
<ConfirmModal
isOpen={!!deleteConfirm}
title={deleteConfirm?.type === 'expense' ? "Delete Expense" : "Delete Transaction"}
message={deleteConfirm?.ids && deleteConfirm.ids.length > 1 ? `This deletes the whole combined payment (${deleteConfirm.ids.length} services). This action cannot be undone.` : `Are you sure you want to delete this ${deleteConfirm?.type}? This action cannot be undone.`}
confirmText="Delete"
onConfirm={() => {
if (deleteConfirm?.type === 'expense') {
handleDeleteExpense(deleteConfirm.id);
} else if (deleteConfirm?.type === 'transaction') {
handleDeleteTransaction(deleteConfirm.id, deleteConfirm.ids);
}
setDeleteConfirm(null);
}}
onCancel={() => setDeleteConfirm(null)}
/>
</div>
);
};
