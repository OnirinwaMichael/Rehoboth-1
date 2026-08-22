import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
// Shown when user.mustChangePassword is true (set on every invited
// staff account). Replaces the old shared-default-password pattern —
// staff set their own password via Supabase's invite email, and this
// screen clears the flag once they confirm it.
export const ForcePasswordChange: React.FC<{ onDone: () => void }> = ({ onDone }) => {
const [password, setPassword] = useState('');
const [confirm, setConfirm] = useState('');
const [submitting, setSubmitting] = useState(false);
const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
if (password.length < 8) {
toast.error('Password must be at least 8 characters.');
return;
}
if (password !== confirm) {
toast.error('Passwords do not match.');
return;
}
setSubmitting(true);
try {
const { error: pwError } = await supabase.auth.updateUser({ password });
if (pwError) throw pwError;
const { data: { user } } = await supabase.auth.getUser();
if (user) {
await supabase.from('users').update({ status: 'active' }).eq('id', user.id);
}
toast.success('Password updated.');
onDone();
} catch (err: any) {
toast.error(err.message || 'Failed to update password.');
} finally {
setSubmitting(false);
}
};
return (
<div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
<form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-6 max-w-sm w-full border border-slate-100">
<div className="text-center space-y-2">
<div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
<Lock className="w-8 h-8 text-white" />
</div>
<h2 className="text-xl font-bold text-slate-900">Set Your Password</h2>
<p className="text-sm text-slate-500">This is required before you can continue.</p>
</div>
<input
type="password"
value={password}
onChange={(e) => setPassword(e.target.value)}
placeholder="New password (min. 8 characters)"
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
<input
type="password"
value={confirm}
onChange={(e) => setConfirm(e.target.value)}
placeholder="Confirm password"
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
/>
<button
type="submit"
disabled={submitting}
className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50"
>
{submitting ? 'Saving...' : 'Set Password'}
</button>
</form>
</div>
);
};
