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
// --- Paginated full-table reads ---
// PostgREST silently caps a plain select('*') at its default max-rows
// setting (commonly 1000). Any list that's meant to show every row in a
// growing table (patients, financials, expenses, etc.) needs to page
// through with .range() instead, or rows past the cap just vanish from
// the UI with no error - this bit the Patient Directory once already.
//
// This also retries each page a few times with backoff before giving
// up, since this app runs on mobile connections where a single request
// can drop. Callers should keep whatever data they already had on a
// failure (returned error) rather than clearing it, and show the user
// something rather than silently rendering an empty list.
export async function fetchAllRows<T = any>(
table: string,
buildQuery: (query: ReturnType<typeof supabase.from>) => any = (q) => q.select('*'),
opts: { pageSize?: number; maxRetries?: number; orderBy?: string; concurrency?: number } = {}
): Promise<{ data: T[]; error: unknown | null }> {
const pageSize = opts.pageSize ?? 1000;
const maxRetries = opts.maxRetries ?? 3;
const concurrency = opts.concurrency ?? 4;
// Without an ORDER BY, Postgres may return overlapping/missing rows between
// pages, so callers that load a whole table pass a unique column to order by.
const fetchPage = async (from: number): Promise<{ page: T[]; error: unknown | null }> => {
let lastError: unknown = null;
for (let attempt = 0; attempt < maxRetries; attempt++) {
let q = buildQuery(supabase.from(table));
if (opts.orderBy) q = q.order(opts.orderBy, { ascending: true });
const { data, error } = await q.range(from, from + pageSize - 1);
if (!error) return { page: (data || []) as T[], error: null };
lastError = error;
await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
}
return { page: [], error: lastError };
};
// First page alone (most tables fit in it), then the rest in parallel batches
// instead of one slow request after another.
const first = await fetchPage(0);
if (first.error) return { data: [], error: first.error };
let allRows: T[] = first.page;
if (first.page.length < pageSize) return { data: allRows, error: null };
let from = pageSize;
while (true) {
const offsets = Array.from({ length: concurrency }, (_, i) => from + i * pageSize);
const batch = await Promise.all(offsets.map(fetchPage));
let done = false;
for (const r of batch) {
if (r.error) return { data: allRows, error: r.error };
allRows = allRows.concat(r.page);
if (r.page.length < pageSize) { done = true; break; }
}
if (done) break;
from += concurrency * pageSize;
}
return { data: allRows, error: null };
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
