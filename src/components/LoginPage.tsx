import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { LogIn, Users, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../lib/auth';
// Unchanged from the original — kept exactly as designed.
export const ECGLogo = () => {
return (
<div className="flex flex-col items-center justify-center mb-12">
<div className="relative w-64 h-24 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 flex items-center justify-center">
<div
className="absolute inset-0"
style={{
backgroundImage:
'linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)',
backgroundSize: '10px 10px',
}}
/>
<svg className="w-full h-full absolute inset-0" viewBox="0 0 400 100" preserveAspectRatio="none">
<motion.path
d="M 0 50 L 100 50 L 120 20 L 140 80 L 160 50 L 250 50 L 270 30 L 290 70 L 310 50 L 400 50"
fill="none"
stroke="#10b981"
strokeWidth="3"
strokeLinecap="round"
strokeLinejoin="round"
initial={{ pathLength: 0, opacity: 0 }}
animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0], x: [0, -100] }}
transition={{ duration: 2, repeat: Infinity, ease: 'linear', times: [0, 0.8, 1] }}
style={{ filter: 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.8))' }}
/>
</svg>
<motion.div
className="absolute w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_4px_rgba(74,222,128,0.6)]"
animate={{ opacity: [1, 0.5, 1], scale: [1, 1.2, 1] }}
transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
style={{ right: '20px', top: '20px' }}
/>
</div>
<h1 className="text-3xl font-black text-slate-900 tracking-tight mt-6">
Rehoboth <span className="text-blue-600">Clinic</span>
</h1>
<p className="text-slate-500 font-medium mt-1">Hospital Management System</p>
</div>
);
};
export const LoginPage = () => {
const { loginWithPassword, user, loading } = useAuth();
const navigate = useNavigate();
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [showPassword, setShowPassword] = useState(false);
const [submitting, setSubmitting] = useState(false);
useEffect(() => {
if (user) navigate('/dashboard');
}, [user, navigate]);
if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
const handleLogin = async (e: React.FormEvent) => {
e.preventDefault();
if (!email || !password) {
toast.error('Please enter both email and password.');
return;
}
setSubmitting(true);
try {
await loginWithPassword(email, password);
} catch {
// toast already shown inside loginWithPassword
} finally {
setSubmitting(false);
}
};
return (
<div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
<ECGLogo />
<motion.div
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
className="max-w-md w-full"
>
<div className="bg-white rounded-2xl shadow-xl p-8 space-y-8 border border-slate-100">
<div className="text-center space-y-4">
<div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
<Users className="w-10 h-10 text-slate-600" />
</div>
<div className="space-y-1">
<h2 className="text-xl font-bold text-slate-900">Staff Login</h2>
<p className="text-sm text-slate-500">CMD and all staff sign in here with their own credentials</p>
</div>
</div>
<form onSubmit={handleLogin} className="space-y-4">
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
<Mail className="w-3 h-3" /> Email Address
</label>
<input
type="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
placeholder="staff@rehoboth.com"
/>
</div>
<div className="space-y-1.5">
<div className="flex items-center justify-between">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
<Lock className="w-3 h-3" /> Password
</label>
<button
type="button"
onClick={() => setShowPassword(!showPassword)}
className="text-blue-600 hover:text-blue-700 text-[10px] font-bold flex items-center gap-1"
>
{showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
{showPassword ? 'Hide' : 'Show'}
</button>
</div>
<input
type={showPassword ? 'text' : 'password'}
value={password}
onChange={(e) => setPassword(e.target.value)}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
placeholder="Your password"
/>
</div>
<button
type="submit"
disabled={submitting}
className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
>
<LogIn className="w-5 h-5" />
{submitting ? 'Signing in...' : 'Login'}
</button>
</form>
<p className="text-[10px] text-slate-400 text-center">
New staff: your CMD will give you a temporary password to log in with.
</p>
</div>
</motion.div>
</div>
);
};
