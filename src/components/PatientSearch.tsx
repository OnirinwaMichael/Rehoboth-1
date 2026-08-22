import React, { useState, useEffect } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { Patient } from '../types';
import { Search, User, Phone, CreditCard, ChevronRight, History, Activity, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { PatientHistory } from './PatientHistory';
import { motion, AnimatePresence } from 'motion/react';
const patientFromRow = (r: any): Patient => ({
cardId: r.card_id, name: r.name, gender: r.gender, dob: r.dob,
stateOfOrigin: r.state_of_origin, age: r.age, occupation: r.occupation,
address: r.address, phone: r.phone, nextOfKin: r.next_of_kin,
relationship: r.relationship, nokAddress: r.nok_address, nokPhone: r.nok_phone,
category: r.category, createdAt: r.created_at,
});
export const PatientSearch: React.FC = () => {
const [searchTerm, setSearchTerm] = useState('');
const [patients, setPatients] = useState<Patient[]>([]);
const [loading, setLoading] = useState(false);
const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
useEffect(() => {
fetchRecent();
const channel = supabase
.channel('patient-search-recent')
.on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, fetchRecent)
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchRecent = async () => {
const { data, error } = await supabase
.from('patients').select('*').order('created_at', { ascending: false }).limit(10);
if (error) return handleSupabaseError(error, 'select', 'patients');
setRecentPatients((data || []).map(patientFromRow));
};
const handleSearch = async (e: React.FormEvent) => {
e.preventDefault();
if (!searchTerm.trim()) return;
setLoading(true);
try {
const term = searchTerm.trim();
const { data: cardData, error: cardErr } = await supabase
.from('patients').select('*').eq('card_id', term);
if (cardErr) throw cardErr;
if (cardData && cardData.length > 0) {
setPatients(cardData.map(patientFromRow));
} else {
// Upgrade over the original's exact-match-only name search:
// ILIKE gives case-insensitive partial matching, so "john"
// finds "John Adeyemi" too.
const { data: nameData, error: nameErr } = await supabase
.from('patients').select('*').ilike('name', `%${term}%`);
if (nameErr) throw nameErr;
setPatients((nameData || []).map(patientFromRow));
}
} catch (error) {
handleSupabaseError(error, 'select', 'patients');
} finally {
setLoading(false);
}
};
return (
<div className="max-w-6xl mx-auto space-y-8">
<div className="flex items-center justify-between">
<div>
<h2 className="text-3xl font-black text-slate-900 tracking-tight">Patient Search</h2>
<p className="text-slate-500 font-medium">Find patients and view their medical history.</p>
</div>
</div>
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
{/* Search Panel */}
<div className="lg:col-span-4 space-y-6">
<form onSubmit={handleSearch} className="relative group">
<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
<input
value={searchTerm}
onChange={e => setSearchTerm(e.target.value)}
className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium text-slate-900 shadow-sm"
placeholder="Search by Card ID or Name..."
/>
<button 
type="submit"
className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
>
Search
</button>
</form>
<div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
<div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
<History className="w-4 h-4 text-slate-400" />
<h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recent Patients</h3>
</div>
<div className="divide-y divide-slate-50">
{(searchTerm ? patients : recentPatients).map((p) => (
<button
key={p.cardId}
onClick={() => setSelectedPatientId(p.cardId)}
className={cn(
"w-full p-4 flex items-center justify-between hover:bg-blue-50/50 transition-all group text-left",
selectedPatientId === p.cardId ? "bg-blue-50" : ""
)}
>
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-bold group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
{p.name.charAt(0)}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{p.name}</p>
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.cardId}</p>
</div>
</div>
<ChevronRight className={cn(
"w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-all",
selectedPatientId === p.cardId ? "translate-x-1 text-blue-600" : ""
)} />
</button>
))}
{patients.length === 0 && searchTerm && !loading && (
<div className="p-8 text-center">
<p className="text-xs text-slate-400 font-bold">No patients found matching "{searchTerm}"</p>
</div>
)}
</div>
</div>
</div>
{/* History Panel */}
<div className="lg:col-span-8">
<AnimatePresence mode="wait">
{selectedPatientId ? (
<motion.div
key={selectedPatientId}
initial={{ opacity: 0, x: 20 }}
animate={{ opacity: 1, x: 0 }}
exit={{ opacity: 0, x: -20 }}
>
<PatientHistory patientId={selectedPatientId} />
</motion.div>
) : (
<div className="h-full min-h-[400px] bg-slate-50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-12">
<div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-200 shadow-sm mb-6">
<User className="w-10 h-10" />
</div>
<h3 className="text-xl font-black text-slate-900 mb-2">Select a Patient</h3>
<p className="text-slate-500 max-w-xs font-medium">
Search for a patient or select one from the recent list to view their full medical and financial history.
</p>
</div>
)}
</AnimatePresence>
</div>
</div>
</div>
);
};
