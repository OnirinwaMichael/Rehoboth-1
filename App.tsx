import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LogOut, LayoutDashboard, Users, ClipboardList, FlaskConical, Receipt, Pill, ShieldCheck, Activity, Search, Menu, Settings, History, Calendar } from 'lucide-react';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './components/LoginPage';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { ReceptionistPortal } from './components/ReceptionistPortal';
import { DoctorNursePortal } from './components/DoctorNursePortal';
import { LabPortal } from './components/LabPortal';
import { AccountantPortal } from './components/AccountantPortal';
import { PharmacyPortal } from './components/PharmacyPortal';
import { CMDPortal } from './components/CMDPortal';
import { ProfileSettings } from './components/ProfileSettings';
import { ClinicalBoard } from './components/ClinicalBoard';
import { PatientSearch } from './components/PatientSearch';
import { SystemClock } from './components/SystemClock';
import { ErrorBoundary } from './components/ErrorBoundary';
import { checkSystemHealth } from './lib/supabase';
import { AnimatePresence } from 'motion/react';
const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const { user, logout } = useAuth();
const [isSidebarOpen, setIsSidebarOpen] = useState(true);
const [isProfileOpen, setIsProfileOpen] = useState(false);
const [currentView, setCurrentView] = useState('Overview');
if (!user) return <Navigate to="/" />;
// Staff who haven't set their own password yet are gated here,
// before they see any clinical data — replaces the old default-
// password flow entirely.
if (user.mustChangePassword) {
return <ForcePasswordChange onDone={() => window.location.reload()} />;
}
const menuItems = [
{ icon: LayoutDashboard, label: 'Overview', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Accountant', 'Receptionist', 'Pharmacy'] },
{ icon: Search, label: 'Patient Search', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Accountant', 'Receptionist', 'Pharmacy'] },
{ icon: Activity, label: 'Clinical Board', role: ['CMD', 'Doctor', 'Nurse', 'Lab', 'Accountant', 'Receptionist', 'Pharmacy'] },
{ icon: Users, label: 'Receptionist Portal', role: ['CMD', 'Receptionist'] },
{ icon: ClipboardList, label: 'Doctor Portal', role: ['CMD', 'Doctor'] },
{ icon: Activity, label: 'Nurse Portal', role: ['CMD', 'Nurse'] },
{ icon: FlaskConical, label: 'Laboratory', role: ['CMD', 'Lab'] },
{ icon: Pill, label: 'Pharmacy', role: ['CMD', 'Pharmacy'] },
{ icon: Receipt, label: 'Accounts', role: ['CMD', 'Accountant'] },
{ icon: ShieldCheck, label: 'Staff Management', role: ['CMD'] },
{ icon: History, label: 'Audit Logs', role: ['CMD'] },
];
return (
<div className="min-h-screen bg-slate-50 flex relative">
{/* Sidebar */}
<aside className={cn(
"bg-slate-900 text-white transition-all duration-300 flex flex-col sticky top-0 h-screen z-40",
isSidebarOpen ? "w-64" : "w-20"
)}>
<div className="p-6 flex items-center gap-3 border-b border-slate-800">
<Activity className="w-8 h-8 text-blue-400 shrink-0" />
{isSidebarOpen && <span className="font-bold text-lg truncate">Rehoboth Clinic</span>}
</div>
<nav className="flex-1 p-4 space-y-2 overflow-y-auto">
{menuItems.filter(item => item.role.includes(user.role)).map((item, idx) => (
<button
key={idx}
onClick={() => setCurrentView(item.label)}
className={cn(
"w-full flex items-center gap-4 p-3 rounded-xl transition-all group",
currentView === item.label
? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
: "text-slate-400 hover:bg-slate-800 hover:text-white"
)}
>
<item.icon className={cn(
"w-6 h-6 shrink-0 transition-colors",
currentView === item.label ? "text-white" : "group-hover:text-blue-400"
)} />
{isSidebarOpen && <span className="font-medium">{item.label}</span>}
</button>
))}
</nav>
<div className="p-4 border-t border-slate-800 space-y-2">
<button
onClick={() => setIsProfileOpen(true)}
className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
>
<Settings className="w-6 h-6 shrink-0" />
{isSidebarOpen && <span className="font-medium">Profile Settings</span>}
</button>
<button
onClick={logout}
className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-red-900/20 text-slate-400 hover:text-red-400 transition-colors"
>
<LogOut className="w-6 h-6 shrink-0" />
{isSidebarOpen && <span className="font-medium">Logout</span>}
</button>
</div>
</aside>
{/* Main Content */}
<main className="flex-1 flex flex-col overflow-hidden">
<header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
<button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg">
<Menu className="w-6 h-6 text-slate-600" />
</button>
<div className="hidden sm:block">
<SystemClock />
</div>
<div className="flex items-center gap-6">
<div className="text-right hidden sm:block">
<p className="text-sm font-bold text-slate-900">{user.name}</p>
<p className="text-xs text-slate-500 uppercase tracking-wider">{user.role}</p>
</div>
<button
onClick={() => setIsProfileOpen(true)}
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
<div className="flex-1 overflow-y-auto p-8">
{React.cloneElement(children as React.ReactElement, { currentView })}
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
const MainDashboard = ({ currentView }: { currentView?: string }) => {
const { user } = useAuth();
if (!user) return null;
const renderContent = () => {
if (currentView === 'Clinical Board') return <ClinicalBoard />;
if (currentView === 'Patient Search') return <PatientSearch />;
if (currentView === 'Staff Management' && user.role === 'CMD') return <CMDPortal />;
if (currentView === 'Receptionist Portal') return <ReceptionistPortal userId={user.id} />;
if (currentView === 'Doctor Portal') return <DoctorNursePortal role="Doctor" userId={user.id} />;
if (currentView === 'Nurse Portal') return <DoctorNursePortal role="Nurse" userId={user.id} />;
if (currentView === 'Laboratory') return <LabPortal userId={user.id} />;
if (currentView === 'Pharmacy') return <PharmacyPortal userId={user.id} />;
if (currentView === 'Accounts') return <AccountantPortal userId={user.id} />;
if (currentView === 'Audit Logs' && user.role === 'CMD') return <CMDPortal showLogsOnly={true} />;
switch (user.role) {
case 'CMD': return <CMDPortal />;
case 'Receptionist': return <ReceptionistPortal userId={user.id} />;
case 'Doctor':
case 'Nurse': return <DoctorNursePortal role={user.role} userId={user.id} />;
case 'Lab': return <LabPortal userId={user.id} />;
case 'Accountant': return <AccountantPortal userId={user.id} />;
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
<div className="space-y-6 sm:space-y-8">
<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
<div>
<h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">
Welcome back, {user.name.split(' ')[0]}!
</h1>
<p className="text-sm sm:text-base text-slate-500 font-medium mt-1">
{currentView || 'Overview'} - {user.role} Portal
</p>
</div>
<div className="flex items-center gap-4 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm self-start lg:self-auto">
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
<Toaster position="top-right" richColors />
{/* System Status Indicator */}
<div className="fixed bottom-4 right-4 z-50">
<div className={cn(
"flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg backdrop-blur-md transition-all",
systemStatus?.database ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
)}>
<div className={cn(
"w-2 h-2 rounded-full animate-pulse",
systemStatus?.database ? "bg-green-500" : "bg-red-500"
)} />
{systemStatus?.database ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
</div>
</div>
</AuthProvider>
</ErrorBoundary>
);
}
