import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { toast } from 'sonner';
export type UserRole = 'CMD' | 'Doctor' | 'Nurse' | 'Lab' | 'Accountant' | 'Receptionist' | 'Pharmacy';
export interface AppUser {
id: string;
email: string;
role: UserRole;
name: string;
status: 'active' | 'inactive' | 'invited';
photoUrl?: string;
phone?: string;
// Derived, not a DB column on this schema — status 'invited' IS the
// must-change-password state until they set their own password.
mustChangePassword: boolean;
}
interface AuthContextType {
user: AppUser | null;
session: Session | null;
loading: boolean;
loginWithPassword: (email: string, password: string) => Promise<void>;
logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const useAuth = () => {
const ctx = useContext(AuthContext);
if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
return ctx;
};
function mapProfile(row: any): AppUser {
return {
id: row.id,
email: row.email,
role: row.role,
name: row.name,
status: row.status,
photoUrl: row.photo_url ?? undefined,
phone: row.phone ?? undefined,
mustChangePassword: row.status === 'invited',
};
}
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const [user, setUser] = useState<AppUser | null>(null);
const [session, setSession] = useState<Session | null>(null);
const [loading, setLoading] = useState(true);
async function loadProfile(authUser: SupabaseUser | null) {
if (!authUser) {
setUser(null);
return;
}
const { data, error } = await supabase
.from('users')
.select('*')
.eq('id', authUser.id)
.single();
if (error || !data) {
// Authenticated in Supabase Auth but no staff profile exists.
// Unlike the old Firebase flow, we do NOT auto-provision a CMD
// here — the first CMD must be seeded via `supabase db` directly
// (see README) so there's no hardcoded admin-email backdoor.
setUser(null);
await supabase.auth.signOut();
toast.error('No staff profile found for this account. Contact your CMD.');
return;
}
if (data.status === 'inactive') {
setUser(null);
await supabase.auth.signOut();
toast.error('This account has been deactivated. Contact your CMD.');
return;
}
// status === 'invited' is allowed through here — ForcePasswordChange
// gates the rest of the app until they set a real password.
setUser(mapProfile(data));
}
useEffect(() => {
supabase.auth.getSession().then(({ data: { session } }) => {
setSession(session);
loadProfile(session?.user ?? null).finally(() => setLoading(false));
});
const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
setSession(session);
setLoading(true);
loadProfile(session?.user ?? null).finally(() => setLoading(false));
});
return () => listener.subscription.unsubscribe();
}, []);
const loginWithPassword = async (email: string, password: string) => {
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
if (error.message.includes('Invalid login credentials')) {
toast.error('Invalid email or password.');
} else {
toast.error('Failed to sign in.');
}
throw error;
}
};
const logout = async () => {
await supabase.auth.signOut();
toast.success('Logged out successfully.');
};
return (
<AuthContext.Provider value={{ user, session, loading, loginWithPassword, logout }}>
{children}
</AuthContext.Provider>
);
};
