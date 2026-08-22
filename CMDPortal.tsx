import React, { useState, useEffect, useMemo, memo } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { User, AuditLog, UserRole } from '../types';
import { toast } from 'sonner';
import { ShieldCheck, UserPlus, Trash2, Edit, Save, X, History, Activity, Eye, EyeOff, User as UserIcon, Mail, Shield, CheckCircle, Clock, Lock, AlertTriangle, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';
import { logAction } from '../lib/audit';
import { useAuth } from '../lib/auth';
const userFromRow = (r: any): User => ({
uid: r.id, email: r.email, role: r.role, name: r.name, status: r.status,
photoURL: r.photo_url, phone: r.phone,
});
const auditLogFromRow = (r: any): AuditLog => ({
id: r.id, staffId: r.staff_id, action: r.action, details: r.details, timestamp: r.timestamp,
});
// --- Sub-components for Performance ---
const StaffRow = memo(({ member, currentUserId, onToggleStatus, onDelete }: {
member: User,
currentUserId: string,
onToggleStatus: (uid: string, currentStatus: string) => void,
onDelete: (uid: string) => void
}) => (
<tr className="hover:bg-slate-50 transition-colors">
<td className="px-6 py-4">
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold overflow-hidden">
{member.photoURL ? (
<img src={member.photoURL} alt="" className="w-full h-full object-cover" />
) : (
member.name.charAt(0)
)}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{member.name}</p>
<p className="text-xs text-slate-400">{member.email}</p>
</div>
</div>
</td>
<td className="px-6 py-4">
<span className={cn(
"text-[10px] font-bold px-2 py-1 rounded-full uppercase",
member.role === 'CMD' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
)}>
{member.role}
</span>
</td>
<td className="px-6 py-4">
<button
onClick={() => onToggleStatus(member.uid, member.status)}
className={cn(
"flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg transition-all",
member.status === 'active' ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-500 hover:bg-red-100"
)}
>
{member.status === 'active' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
{member.status}
</button>
</td>
<td className="px-6 py-4">
<div className="flex gap-2">
{member.uid !== currentUserId && (
<button
onClick={() => onDelete(member.uid)}
className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
title="Remove Staff"
>
<Trash2 className="w-4 h-4" />
</button>
)}
</div>
</td>
</tr>
));
const LogItem = memo(({ log }: { log: AuditLog }) => (
<div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
<div className="flex justify-between items-start">
<span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{log.action}</span>
<span className="text-[10px] text-slate-400">
{log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '...'}
</span>
</div>
<p className="text-xs text-slate-700 font-medium">{log.details}</p>
<p className="text-[10px] text-slate-400">Staff ID: {log.staffId}</p>
</div>
));
export const CMDPortal = ({ showLogsOnly = false }: { showLogsOnly?: boolean }) => {
const { user } = useAuth();
const userId = user?.id || '';
const [staff, setStaff] = useState<User[]>([]);
const [logs, setLogs] = useState<AuditLog[]>([]);
const [loading, setLoading] = useState(true);
const [isAddingStaff, setIsAddingStaff] = useState(false);
const [showLogs, setShowLogs] = useState(true);
const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
const [authError, setAuthError] = useState<string | null>(null);
const [customPassword, setCustomPassword] = useState('');
const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; name: string } | null>(null);
const [staffForm, setStaffForm] = useState({
name: '',
email: '',
role: 'Doctor' as UserRole,
photoURL: '',
});
useEffect(() => {
fetchStaff();
fetchLogs();
const channel = supabase
.channel('cmd-portal')
.on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchStaff)
.on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, fetchLogs)
.subscribe();
return () => { supabase.removeChannel(channel); };
}, []);
const fetchStaff = async () => {
const { data, error } = await supabase.from('users').select('*').order('name', { ascending: true });
if (error) return handleSupabaseError(error, 'select', 'users');
setStaff((data || []).map(userFromRow));
};
const fetchLogs = async () => {
const { data, error } = await supabase
.from('audit_logs')
.select('*')
.order('timestamp', { ascending: false })
.limit(50);
if (error) { handleSupabaseError(error, 'select', 'audit_logs'); setLoading(false); return; }
setLogs((data || []).map(auditLogFromRow));
setLoading(false);
};
const handleAddStaff = async (e: React.FormEvent) => {
e.preventDefault();
setAuthError(null);
const emailExists = staff.some(s => s.email.toLowerCase() === staffForm.email.toLowerCase());
if (emailExists) {
setAuthError('A staff member with this email already exists in the directory.');
return;
}
if (staffForm.role === 'CMD') {
const cmdCount = staff.filter(s => s.role === 'CMD').length;
if (cmdCount >= 3) {
setAuthError('Maximum number of CMDs (3) reached. Cannot assign more CMD roles.');
return;
}
}
try {
// create-staff Edge Function: verifies caller is CMD, issues a
// unique temporary password (never a shared default), sets
// status='invited' (gates the app via ForcePasswordChange until
// they set their own password). No email dependency at all.
const { data, error } = await supabase.functions.invoke('create-staff', {
body: {
name: staffForm.name,
email: staffForm.email,
role: staffForm.role,
photoURL: staffForm.photoURL || null,
customPassword: customPassword.trim() || undefined,
},
});
if (error) {
let message = error.message;
try {
const body = await error.context?.json();
if (body?.error) message = body.error;
} catch {
// response body wasn't JSON — fall back to error.message
}
throw new Error(message);
}
if (data?.error) throw new Error(data.error);
await logAction(userId, 'REGISTER_STAFF', `Registered new staff: ${staffForm.name} (${staffForm.role})`);
// Show the temp password once, in-app, instead of relying on
// email delivery — CMD relays it to the staff member directly.
setCreatedCredentials({ email: staffForm.email, password: data.tempPassword, name: staffForm.name });
setIsAddingStaff(false);
setCustomPassword('');
setStaffForm({ name: '', email: '', role: 'Doctor', photoURL: '' });
} catch (error: any) {
setAuthError(error.message || 'Registration failed.');
}
};
const handleBulkDelete = async () => {
if (selectedStaff.size === 0) return;
setLoading(true);
try {
const idsToDelete = Array.from(selectedStaff).filter(uid => {
const member = staff.find(s => s.uid === uid);
return member && member.uid !== userId;
});
const { error } = await supabase.from('users').delete().in('id', idsToDelete);
if (error) throw error;
toast.success(`Successfully removed ${idsToDelete.length} staff members.`);
setSelectedStaff(new Set());
setBulkDeleteConfirm(false);
} catch (error) {
handleSupabaseError(error, 'delete', 'users');
} finally {
setLoading(false);
}
};
const handleBulkStatusChange = async (newStatus: 'active' | 'inactive') => {
if (selectedStaff.size === 0) return;
setLoading(true);
try {
const { error } = await supabase.from('users').update({ status: newStatus }).in('id', Array.from(selectedStaff));
if (error) throw error;
toast.success(`Updated status for ${selectedStaff.size} staff members.`);
setSelectedStaff(new Set());
} catch (error) {
handleSupabaseError(error, 'update', 'users');
} finally {
setLoading(false);
}
};
const toggleSelectStaff = (uid: string) => {
const newSelected = new Set(selectedStaff);
if (newSelected.has(uid)) {
newSelected.delete(uid);
} else {
newSelected.add(uid);
}
setSelectedStaff(newSelected);
};
const toggleSelectAll = () => {
if (selectedStaff.size === staff.length) {
setSelectedStaff(new Set());
} else {
setSelectedStaff(new Set(staff.map(s => s.uid)));
}
};
const handleDeleteStaff = async (uid: string) => {
const { error } = await supabase.from('users').delete().eq('id', uid);
if (error) {
console.error('Delete staff error:', error);
toast.error('Failed to remove staff.');
return;
}
toast.success('Staff member removed.');
setDeleteConfirm(null);
};
const toggleStaffStatus = async (uid: string, currentStatus: string) => {
const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', uid);
if (error) {
console.error('Update status error:', error);
toast.error('Failed to update status.');
return;
}
toast.success(`Staff status changed to ${newStatus}`);
};
// Memoized sections to prevent lag
const staffTable = useMemo(() => (
<div className="overflow-x-auto">
{selectedStaff.size > 0 && (
<div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between animate-in slide-in-from-top duration-300">
<div className="flex items-center gap-4">
<span className="text-sm font-bold text-blue-700">{selectedStaff.size} staff selected</span>
<div className="h-4 w-px bg-blue-200" />
<button 
onClick={() => handleBulkStatusChange('active')}
className="text-xs font-bold text-blue-600 hover:text-blue-800"
>
Activate All
</button>
<button 
onClick={() => handleBulkStatusChange('inactive')}
className="text-xs font-bold text-blue-600 hover:text-blue-800"
>
Deactivate All
</button>
</div>
<button 
onClick={() => setBulkDeleteConfirm(true)}
className="flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-all"
>
<Trash2 className="w-3.5 h-3.5" /> Remove Selected
</button>
</div>
)}
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
<th className="px-6 py-4 w-10">
<input 
type="checkbox" 
checked={selectedStaff.size === staff.length && staff.length > 0}
onChange={toggleSelectAll}
className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
/>
</th>
<th className="px-6 py-4">Staff Member</th>
<th className="px-6 py-4">Role</th>
<th className="px-6 py-4">Status</th>
<th className="px-6 py-4">Actions</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-50">
{staff.map((member) => (
<tr key={member.uid} className={cn("hover:bg-slate-50 transition-colors", selectedStaff.has(member.uid) && "bg-blue-50/30")}>
<td className="px-6 py-4">
<input 
type="checkbox" 
checked={selectedStaff.has(member.uid)}
onChange={() => toggleSelectStaff(member.uid)}
className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
/>
</td>
<td className="px-6 py-4">
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold overflow-hidden">
{member.photoURL ? (
<img src={member.photoURL} alt="" className="w-full h-full object-cover" />
) : (
member.name.charAt(0)
)}
</div>
<div>
<p className="text-sm font-bold text-slate-900">{member.name}</p>
<p className="text-xs text-slate-400">{member.email}</p>
</div>
</div>
</td>
<td className="px-6 py-4">
<span className={cn(
"text-[10px] font-bold px-2 py-1 rounded-full uppercase",
member.role === 'CMD' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
)}>
{member.role}
</span>
</td>
<td className="px-6 py-4">
<button
onClick={() => toggleStaffStatus(member.uid, member.status)}
className={cn(
"flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg transition-all",
member.status === 'active' ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-500 hover:bg-red-100"
)}
>
{member.status === 'active' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
{member.status}
</button>
</td>
<td className="px-6 py-4">
<div className="flex gap-2">
{member.uid !== userId && (
<button
onClick={() => setDeleteConfirm(member.uid)}
className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
title="Remove Staff"
>
<Trash2 className="w-4 h-4" />
</button>
)}
</div>
</td>
</tr>
))}
</tbody>
</table>
</div>
), [staff, selectedStaff]);
const auditLogList = useMemo(() => (
<div className="flex-1 overflow-y-auto p-4 space-y-4">
{showLogs ? (
logs.map((log) => (
<LogItem key={log.id} log={log} />
))
) : (
<div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
<EyeOff className="w-12 h-12 opacity-20" />
<p className="font-medium">Audit logs are hidden</p>
</div>
)}
{logs.length === 0 && showLogs && (
<p className="text-center text-slate-400 text-sm py-20">No logs recorded yet.</p>
)}
</div>
), [logs, showLogs]);
return (
<div className="space-y-8 max-w-7xl mx-auto">
{!showLogsOnly && (
<div className="flex items-center justify-between">
<div>
<h2 className="text-3xl font-bold text-slate-900">CMD Command Center</h2>
<p className="text-slate-500">Full administrative control and hospital oversight.</p>
</div>
<div className="flex gap-4">
<button
onClick={() => setShowLogs(!showLogs)}
className={cn(
"flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
showLogs ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"
)}
>
{showLogs ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
{showLogs ? 'Logs Visible' : 'Logs Hidden'}
</button>
<button
onClick={() => setIsAddingStaff(true)}
className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
>
<UserPlus className="w-5 h-5" />
Add Staff
</button>
</div>
</div>
)}
{showLogsOnly && (
<div>
<h2 className="text-3xl font-bold text-slate-900">Audit Logs</h2>
<p className="text-slate-500">Real-time tracking of all hospital activities.</p>
</div>
)}
{/* Setup Help Card */}
{!loading && (
<div className="mb-8 p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4 animate-in fade-in slide-in-from-top duration-500">
<div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
<ShieldCheck className="w-6 h-6" />
</div>
<div>
<h3 className="text-sm font-bold text-blue-900 mb-1">How Staff Registration Works</h3>
<p className="text-xs text-blue-700 leading-relaxed max-w-2xl">
New staff get a unique temporary password when you register them — you'll see it
once, right after creation, to relay to them directly. No shared passwords, no
email dependency. They'll show up with status <strong>invited</strong> until they
log in and set their own password.
</p>
</div>
</div>
)}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
{/* Staff Management */}
{!showLogsOnly && (
<div className={cn(
"space-y-6 transition-all duration-500",
showLogs ? "lg:col-span-8" : "lg:col-span-12"
)}>
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<h3 className="font-bold text-slate-900 flex items-center gap-2">
<ShieldCheck className="w-5 h-5 text-blue-600" /> Staff Directory
</h3>
<span className="text-xs font-bold text-slate-400 uppercase">{staff.length} Members</span>
</div>
{staffTable}
</div>
</div>
)}
{/* Audit Logs */}
{(showLogs || showLogsOnly) && (
<div className={cn(
"transition-all duration-500",
showLogsOnly ? "lg:col-span-12" : "lg:col-span-4"
)}>
<div className={cn(
"bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col",
showLogsOnly ? "h-[calc(100vh-200px)]" : "h-[calc(100vh-250px)]"
)}>
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
<h3 className="font-bold flex items-center gap-2">
<History className="w-5 h-5 text-blue-400" /> Audit Logs
</h3>
<Activity className="w-4 h-4 text-green-400 animate-pulse" />
</div>
{auditLogList}
</div>
</div>
)}
</div>
{/* Delete Confirmation Modal */}
<AnimatePresence>
{deleteConfirm && (
<div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
>
<div className="p-6 text-center space-y-4">
<div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
<AlertTriangle className="w-8 h-8" />
</div>
<div>
<h3 className="text-xl font-bold text-slate-900">Confirm Removal</h3>
<p className="text-slate-500 text-sm mt-1">
Are you sure you want to remove this staff member? This action cannot be undone.
</p>
</div>
<div className="flex gap-3 pt-2">
<button
onClick={() => setDeleteConfirm(null)}
className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
>
Cancel
</button>
<button
onClick={() => handleDeleteStaff(deleteConfirm)}
className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
>
Remove
</button>
</div>
</div>
</motion.div>
</div>
)}
</AnimatePresence>
{/* Add Staff Modal */}
<AnimatePresence>
{isAddingStaff && (
<div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
>
<div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
<h3 className="font-bold flex items-center gap-2">
<UserPlus className="w-5 h-5 text-blue-400" /> Register New Staff
</h3>
<button onClick={() => setIsAddingStaff(false)} className="p-1 hover:bg-white/10 rounded-lg">
<X className="w-5 h-5" />
</button>
</div>
<form onSubmit={handleAddStaff} className="p-8 space-y-6">
{authError && (
<div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-bold">
{authError}
</div>
)}
<div className="flex flex-col md:flex-row gap-6">
{/* Profile Picture Upload */}
<div className="flex flex-col items-center gap-3 shrink-0">
<div className="relative group">
<div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
{staffForm.photoURL ? (
<img src={staffForm.photoURL} alt="Preview" className="w-full h-full object-cover" />
) : (
<UserIcon className="w-8 h-8 text-slate-300" />
)}
</div>
<label className="absolute bottom-0 right-0 p-1.5 bg-blue-600 rounded-full text-white cursor-pointer shadow-lg hover:bg-blue-700 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
<Camera className="w-4 h-4" />
<input 
type="file" 
className="hidden" 
accept="image/*" 
onChange={(e) => {
const file = e.target.files?.[0];
if (file) {
if (file.size > 500000) {
toast.error('Image too large (max 500KB)');
return;
}
const reader = new FileReader();
reader.onloadend = () => {
setStaffForm({ ...staffForm, photoURL: reader.result as string });
};
reader.readAsDataURL(file);
}
}} 
/>
</label>
</div>
<p className="text-[10px] font-bold text-slate-400 uppercase">Profile Picture (Optional)</p>
</div>
<div className="space-y-4 flex-1">
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700 flex items-center gap-2">
<UserIcon className="w-4 h-4" /> Full Name
</label>
<input
required
value={staffForm.name}
onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
placeholder="Dr. Jane Smith"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700 flex items-center gap-2">
<Mail className="w-4 h-4" /> Email Address
</label>
<input
type="email"
required
value={staffForm.email}
onChange={e => setStaffForm({ ...staffForm, email: e.target.value })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
placeholder="jane@rehoboth.com"
/>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700 flex items-center gap-2">
<Shield className="w-4 h-4" /> Assigned Role
</label>
<select
value={staffForm.role}
onChange={e => setStaffForm({ ...staffForm, role: e.target.value as UserRole })}
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
>
<option value="Doctor">Doctor</option>
<option value="Nurse">Nurse</option>
<option value="Lab">Lab Technician</option>
<option value="Accountant">Accountant</option>
<option value="Receptionist">Receptionist</option>
<option value="Pharmacy">Pharmacist</option>
<option value="CMD">CMD (Admin)</option>
</select>
</div>
<div className="space-y-2">
<label className="text-sm font-bold text-slate-700 flex items-center gap-2">
<Lock className="w-4 h-4" /> Temporary Password (optional)
</label>
<input
type="text"
value={customPassword}
onChange={e => setCustomPassword(e.target.value)}
placeholder="Leave blank to auto-generate a secure one"
className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
minLength={8}
/>
<p className="text-xs text-slate-400">
They'll be required to set their own password on first login. You'll relay this one to them directly.
</p>
</div>
</div>
</div>
<button
type="submit"
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 min-h-[48px]"
>
<Save className="w-5 h-5" />
Save Staff Member
</button>
</form>
</motion.div>
</div>
)}
</AnimatePresence>
<AnimatePresence>
{createdCredentials && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 space-y-6"
>
<div className="text-center space-y-2">
<div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
<CheckCircle className="w-7 h-7 text-green-600" />
</div>
<h3 className="text-lg font-bold text-slate-900">Staff Account Created</h3>
<p className="text-sm text-slate-500">
Share these credentials with {createdCredentials.name} directly — this password won't be shown again.
</p>
</div>
<div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
<div>
<p className="text-xs font-bold text-slate-400 uppercase">Email</p>
<p className="text-sm font-mono text-slate-900">{createdCredentials.email}</p>
</div>
<div>
<p className="text-xs font-bold text-slate-400 uppercase">Temporary Password</p>
<p className="text-sm font-mono text-slate-900 select-all">{createdCredentials.password}</p>
</div>
</div>
<button
onClick={() => {
navigator.clipboard?.writeText(
`Email: ${createdCredentials.email}\nTemporary Password: ${createdCredentials.password}\n\nLog in and you'll be asked to set your own password.`
);
toast.success('Copied to clipboard');
}}
className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all"
>
Copy Credentials
</button>
<button
onClick={() => setCreatedCredentials(null)}
className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all"
>
Done
</button>
</motion.div>
</div>
)}
</AnimatePresence>
<ConfirmModal
isOpen={!!deleteConfirm}
title="Remove Staff"
message="Are you sure you want to remove this staff member? This action cannot be undone."
confirmText="Remove"
onCancel={() => setDeleteConfirm(null)}
onConfirm={async () => {
if (deleteConfirm) {
const { error } = await supabase.from('users').delete().eq('id', deleteConfirm);
if (error) {
handleSupabaseError(error, 'delete', 'users');
return;
}
toast.success('Staff member removed.');
setDeleteConfirm(null);
}
}}
/>
<ConfirmModal
isOpen={bulkDeleteConfirm}
title="Remove Multiple Staff"
message={`Are you sure you want to remove ${selectedStaff.size} staff members? This action cannot be undone.`}
confirmText="Remove All"
onCancel={() => setBulkDeleteConfirm(false)}
onConfirm={() => {
handleBulkDelete();
}}
/>
</div>
);
};
