import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
throw new Error(
'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
);
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
auth: {
persistSession: true,
autoRefreshToken: true,
detectSessionInUrl: true,
},
});
// --- Error handling (mirrors old handleFirestoreError, but never
// bundles PII into the thrown message — logs it locally only) ---
export function handleSupabaseError(error: unknown, operation: string, table: string) {
const message = error instanceof Error ? error.message : String(error);
// Log locally for debugging; do NOT include email/PII in what gets
// thrown, since thrown messages can end up in crash reporters.
console.error(`[Supabase:${table}:${operation}]`, message);
throw new Error(`Database operation failed (${operation} on ${table}). See console for details.`);
}
// --- System health check ---
export async function checkSystemHealth() {
const status = { auth: false, database: false, online: navigator.onLine };
try {
const { data } = await supabase.auth.getSession();
status.auth = true;
const { error } = await supabase.from('users').select('id').limit(1);
status.database = !error;
} catch (err) {
console.error('Health check failed:', err);
}
return status;
}
