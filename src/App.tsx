import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { X, LogOut, LayoutDashboard, Users, ClipboardList, FlaskConical, Pill, ShieldCheck, Activity, Search, Menu, Settings, History, Calendar, UserPlus, UserSearch, Wallet, CheckCircle, TrendingDown, FileSpreadsheet } from 'lucide-react';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './components/LoginPage';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { ReceptionistPortal } from './components/ReceptionistPortal';
import { DoctorNursePortal } from './components/DoctorNursePortal';
import { LabPortal } from './components/LabPortal';
import { FinancePortal } from './components/FinancePortal';
import { PharmacyPortal } from './components/PharmacyPortal';
import { CMDPortal } from './components/CMDPortal';
import { ProfileSettings } from './components/ProfileSettings';
import { ClinicalBoard } from './components/ClinicalBoard';
import { PatientSearch } from './components/PatientSearch';
import { SystemClock } from './components/SystemClock';
import { TimeFormatSync } from './components/TimeFormatSync';
import { IdleLogout } from './components/IdleLogout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { checkSystemHealth } from './lib/supabase';
import { usePendingBillsAlert } from './lib/usePendingBillsAlert';
import { AnimatePresence } from 'motion/react';
const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const { user, logout } = useAuth();
const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
try { return localStorage.getItem('hms.sidebarOpen') !== '0'; } catch { return true; }
});
useEffect(() => {
try { localStorage.setItem('hms.sidebarOpen', isSidebarOpen ? '1' : '0'); } catch { /* storage unavailable: fine */ }
}, [isSidebarOpen]);
const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
const [isDesktop, setIsDesktop] = useState(() => typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches);
const [isProfileOpen, setIsProfileOpen] = useState(false);
const [currentView, setCurrentView] = useState('Overview');
// Below the lg breakpoint the sidebar is a slide-in drawer instead of a fixed column.
useEffect(() => {
const mq = window.matchMedia('(min-width: 1024px)');
const onChange = () => { setIsDesktop(mq.matches); };
mq.addEventListener('change', onChange);
return () => mq.removeEventListener('change', onChange);
}, []);
// Escape closes the drawer; the page behind it does not scroll while it is open.
useEffect(() => {
if (!isMobileNavOpen) return;
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMobileNavOpen(false); };
window.addEventListener('keydown', onKey);
const prev = document.body.style.overflow;
document.body.style.overflow = 'hidden';
return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
}, [isMobileNavOpen]);
// Labels always show in the mobile drawer; on desktop they follow the collapse toggle.
const showLabels = true;
// Receptionist and CMD: live count of patients with unpaid bills (badge on Finance) and a
// toast when a new bill is raised, e.g. a walk-in's lab test.
const pendingBillPatients = usePendingBillsAlert(!!user && !user.mustChangePassword && (user.role === 'CMD' || user.role === 'Receptionist'));
if (!user) return <Navigate to="/" />
// Staff who haven't set their own password yet are gated here,
// before they see any clinical data — replaces the old default-
// password flow entirely.
if (user.mustChangePassword) {
return <ForcePasswordChange onDone={() => window.location.reload()} />;
}
const menuItems = [
{ icon: LayoutDashboard, label: 'Overview', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Pharmacy'], color: 'text-slate-300 bg-slate-700', group: 'Overview' },
{ icon: Search, label: 'Patient Search', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Pharmacy'], color: 'text-blue-400 bg-blue-500/10', group: 'Clinical' },
{ icon: Activity, label: 'Clinical Board', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Pharmacy'], color: 'text-purple-400 bg-purple-500/10', group: 'Clinical' },
{ icon: LayoutDashboard, label: 'Dashboard', role: ['CMD', 'Receptionist'], color: 'text-blue-400 bg-blue-500/10', group: 'Overview' },
{ icon: UserPlus, label: 'Patient Registration', role: ['CMD', 'Receptionist'], color: 'text-emerald-400 bg-emerald-500/10', group: 'Patients' },
{ icon: Calendar, label: 'Appointment', role: ['CMD', 'Receptionist'], color: 'text-violet-400 bg-violet-500/10', group: 'Patients' },
{ icon: Users, label: 'Patient Directory', role: ['CMD', 'Receptionist'], color: 'text-cyan-400 bg-cyan-500/10', group: 'Patients' },
{ icon: UserSearch, label: 'Patients', role: ['CMD', 'Receptionist'], color: 'text-indigo-400 bg-indigo-500/10', group: 'Patients' },
{ icon: Wallet, label: 'Finance', role: ['CMD', 'Receptionist'], color: 'text-orange-400 bg-orange-500/10', group: 'Finance' },
{ icon: CheckCircle, label: 'Reconciliation', role: ['CMD', 'Receptionist'], color: 'text-teal-400 bg-teal-500/10', group: 'Finance' },
{ icon: TrendingDown, label: 'Expenses', role: ['CMD', 'Receptionist'], color: 'text-rose-400 bg-rose-500/10', group: 'Finance' },
{ icon: FileSpreadsheet, label: 'Reports', role: ['CMD', 'Receptionist'], color: 'text-pink-400 bg-pink-500/10', group: 'Finance' },
{ icon: ClipboardList, label: 'Doctor Portal', role: ['CMD', 'Doctor'], color: 'text-blue-400 bg-blue-500/10', group: 'Departments' },
{ icon: Activity, label: 'Nurse Portal', role: ['CMD', 'Nurse'], color: 'text-rose-400 bg-rose-500/10', group: 'Departments' },
{ icon: FlaskConical, label: 'Laboratory', role: ['CMD', 'Lab'], color: 'text-amber-400 bg-amber-500/10', group: 'Departments' },
{ icon: Pill, label: 'Pharmacy', role: ['CMD', 'Pharmacy'], color: 'text-emerald-400 bg-emerald-500/10', group: 'Departments' },
{ icon: ShieldCheck, label: 'Staff Management', role: ['CMD'], color: 'text-slate-300 bg-slate-700', group: 'Administration' },
{ icon: History, label: 'Audit Logs', role: ['CMD'], color: 'text-slate-300 bg-slate-700', group: 'Administration' },
];
return (
<div className="min-h-dvh bg-slate-50 flex relative">
{/* Mobile drawer backdrop */}
{isMobileNavOpen && (
<div
className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm"
onClick={() => setIsMobileNavOpen(false)}
aria-hidden="true"
/>
)}
{/* Sidebar: slide-in drawer on phones/tablets, sticky column on desktop */}
<aside className={cn(
"bg-slate-900 text-white flex flex-col h-dvh z-50 transition-all duration-300 pt-safe pb-safe",
"fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl",
isMobileNavOpen ? "translate-x-0" : "-translate-x-full",
)}>
<div className="p-4 sm:p-6 flex items-center gap-3 border-b border-slate-800">
<Activity className="w-8 h-8 text-blue-400 shrink-0" />
{showLabels && <span className="font-bold text-lg truncate flex-1">Rehoboth Clinic</span>}
<button
onClick={() => setIsMobileNavOpen(false)}
className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
aria-label="Close menu"
>
<X className="w-5 h-5" />
</button>
</div>
<nav className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto overscroll-contain scroll-thin">
{(() => {
const items = menuItems.filter(item => item.role.includes(user.role));
let lastGroup: string | undefined = undefined;
return items.map((item, idx) => {
const showGroupLabel = showLabels && item.group && item.group !== lastGroup;
lastGroup = item.group;
return (
<React.Fragment key={idx}>
{showGroupLabel && (
<p className="px-3 pt-4 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{item.group}</p>
)}
<button
onClick={() => {
// Re-clicking the active item returns that section to its home screen
// (the section component listens for this; e.g. Finance leaves a patient's billing).
if (currentView === item.label) window.dispatchEvent(new CustomEvent('nav-reselect', { detail: item.label }));
setCurrentView(item.label);
setIsMobileNavOpen(false);
}}
aria-current={currentView === item.label ? 'page' : undefined}
title={!showLabels ? item.label : undefined}
className={cn(
"relative w-full flex items-center gap-3 p-2.5 min-h-12 rounded-xl transition-all group",
currentView === item.label
? "bg-slate-800 text-white ring-1 ring-slate-700 before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1 before:rounded-full before:bg-blue-400"
: "text-slate-300 hover:bg-slate-800/60 hover:text-white"
)}
>
<span className={cn("relative w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors", item.color)}>
<item.icon className="w-4 h-4" />
{item.label === 'Finance' && pendingBillPatients > 0 && !showLabels && (
<span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-orange-500 border-2 border-slate-900" />
)}
</span>
{showLabels && <span className="font-medium text-sm truncate">{item.label}</span>}
{showLabels && item.label === 'Finance' && pendingBillPatients > 0 && (
<span className="ml-auto bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" title="Patients with unpaid bills">{pendingBillPatients}</span>
)}
</button>
</React.Fragment>
);
});
})()}
</nav>
<div className="p-3 sm:p-4 border-t border-slate-800 space-y-1">
<button
onClick={() => { setIsProfileOpen(true); setIsMobileNavOpen(false); }}
className="w-full flex items-center gap-4 p-3 min-h-12 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
>
<Settings className="w-6 h-6 shrink-0" />
{showLabels && <span className="font-medium">Profile Settings</span>}
</button>
<button
onClick={logout}
className="w-full flex items-center gap-4 p-3 min-h-12 rounded-xl hover:bg-red-900/20 text-slate-300 hover:text-red-400 transition-colors"
>
<LogOut className="w-6 h-6 shrink-0" />
{showLabels && <span className="font-medium">Logout</span>}
</button>
</div>
</aside>
{/* Main Content */}
<main className="flex-1 min-w-0 h-dvh flex flex-col overflow-hidden">
<header className="h-14 sm:h-16 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between gap-3 px-3 sm:px-6 lg:px-8 shrink-0 sticky top-0 z-30 pt-safe">
<div className="flex items-center gap-2 min-w-0">
<button
onClick={() => setIsMobileNavOpen(true)}
className="relative p-2.5 hover:bg-slate-100 rounded-lg shrink-0"
aria-label="Open menu"
>
<Menu className="w-6 h-6 text-slate-600" />
{pendingBillPatients > 0 && (
<span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white" />
)}
</button>
{/* Current section name: orientation on every screen size */}
<span className="font-bold text-slate-900 truncate">{currentView === 'Overview' ? 'Home' : currentView}</span>
</div>
<SystemClock />
<div className="flex items-center gap-3 sm:gap-6 shrink-0">
<div className="text-right hidden sm:block">
<p className="text-sm font-bold text-slate-900">{user.name}</p>
<p className="text-xs text-slate-500 uppercase tracking-wider">{user.role}</p>
</div>
<button
onClick={() => setIsProfileOpen(true)}
aria-label="Profile settings"
className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold overflow-hidden border-2 border-white shadow-sm hover:ring-2 hover:ring-blue-500 transition-all"
>
{user.photoUrl ? (
<img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
) : (
user.name.charAt(0)
)}
</button>
</div>
</header>
<div className="flex-1 min-w-0 overflow-y-auto scroll-thin p-3 sm:p-6 lg:p-8 pb-safe">
<div className="mx-auto w-full max-w-[1800px]">
{React.cloneElement(children as React.ReactElement, { currentView, onNavigate: setCurrentView })}
</div>
</div>
</main>
{/* Profile Modal */}
<AnimatePresence>
{isProfileOpen && (
<div
className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
onClick={(e) => {
if (e.target === e.currentTarget) setIsProfileOpen(false);
}}
>
<ProfileSettings
user={{ uid: user.id, email: user.email, role: user.role, name: user.name, status: user.status, photoURL: user.photoUrl, phone: user.phone }}
onClose={() => setIsProfileOpen(false)}
/>
</div>
)}
</AnimatePresence>
</div>
);
};
// --- Role Specific Views ---
const MainDashboard = ({ currentView, onNavigate }: { currentView?: string; onNavigate?: (view: string) => void }) => {
const { user } = useAuth();
if (!user) return null;
// Labels shown in the sidebar for Receptionist (and CMD viewing the
// same items) all route through one ReceptionistPortal instance,
// which owns the section switch internally - this keeps its fetches
// and realtime subscriptions from remounting on every nav click.
const receptionistSectionMap: Record<string, string> = {
'Dashboard': 'dashboard',
'Patient Registration': 'register',
'Appointment': 'appointments',
'Patient Directory': 'directory',
'Patients': 'patients',
'Finance': 'finance',
'Reconciliation': 'reconciliation',
'Expenses': 'expenses',
'Reports': 'reports',
};
const renderContent = () => {
if (currentView === 'Clinical Board') return <ClinicalBoard />;
if (currentView === 'Patient Search') return <PatientSearch />;
if (currentView === 'Staff Management' && user.role === 'CMD') return <CMDPortal />;
if (currentView && receptionistSectionMap[currentView]) {
return <ReceptionistPortal userId={user.id} section={receptionistSectionMap[currentView] as any} onNavigate={onNavigate} />;
}
if (currentView === 'Doctor Portal') return <DoctorNursePortal role="Doctor" userId={user.id} />;
if (currentView === 'Nurse Portal') return <DoctorNursePortal role="Nurse" userId={user.id} />;
if (currentView === 'Laboratory') return <LabPortal userId={user.id} />;
if (currentView === 'Pharmacy') return <PharmacyPortal userId={user.id} />;
if (currentView === 'Audit Logs' && user.role === 'CMD') return <CMDPortal showLogsOnly={true} />;
switch (user.role) {
case 'CMD': return <CMDPortal />;
case 'Receptionist': return <ReceptionistPortal userId={user.id} section="dashboard" onNavigate={onNavigate} />;
case 'Doctor':
case 'Nurse': return <DoctorNursePortal role={user.role} userId={user.id} />;
case 'Lab': return <LabPortal userId={user.id} />;
case 'Pharmacy': return <PharmacyPortal userId={user.id} />;
default: return (
<div className="text-center py-20">
<Activity className="w-16 h-16 text-blue-400 mx-auto mb-4" />
<h2 className="text-2xl font-bold text-slate-900">Welcome to the {user.role} Portal</h2>
<p className="text-slate-500">Select an option from the sidebar to get started.</p>
</div>
);
}
};
return (
<div className="space-y-4 sm:space-y-8">
<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-6">
<div>
<h1 className="text-xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">
Welcome back, {user.name.split(' ')[0]}!
</h1>
<p className="text-sm sm:text-base text-slate-600 font-medium mt-0.5 sm:mt-1">
{currentView || 'Overview'} - {user.role} Portal
</p>
</div>
<div className="hidden sm:flex items-center gap-4 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm self-start lg:self-auto">
<div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
<Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
</div>
<div>
<p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">{format(new Date(), 'EEEE')}</p>
<p className="text-base sm:text-lg font-bold text-slate-900 whitespace-nowrap">{format(new Date(), 'MMMM do, yyyy')}</p>
</div>
</div>
</div>
{renderContent()}
</div>
);
};
// --- App ---
export default function App() {
const [systemStatus, setSystemStatus] = useState<{ auth: boolean; database: boolean; online: boolean } | null>(null);
useEffect(() => {
checkSystemHealth().then(setSystemStatus);
}, []);
return (
<ErrorBoundary>
<AuthProvider>
<Router>
<Routes>
<Route path="/" element={<LoginPage />} />
<Route path="/dashboard" element={
<DashboardLayout>
<MainDashboard />
</DashboardLayout>
} />
<Route path="*" element={<Navigate to="/" />} />
</Routes>
</Router>
<TimeFormatSync />
<IdleLogout />
<Toaster position="top-center" richColors />
{/* System Status Indicator: a compact dot on phones so it never covers content, full label from sm up */}
<div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-30 pointer-events-none">
<div
role="status"
aria-label={systemStatus?.database ? 'System online' : 'System offline'}
className={cn(
"flex items-center gap-2 rounded-full text-[10px] font-bold shadow-lg backdrop-blur-md transition-all p-2 sm:px-3 sm:py-1.5",
systemStatus?.database ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"
)}>
<div className={cn(
"w-2 h-2 rounded-full animate-pulse",
systemStatus?.database ? "bg-green-500" : "bg-red-500"
)} />
<span className="hidden sm:inline">{systemStatus?.database ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</span>
</div>
</div>
</AuthProvider>
</ErrorBoundary>
);
}
