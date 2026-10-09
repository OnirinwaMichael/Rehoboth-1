import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { loadOwnedDraft, saveOwnedDraft } from '../lib/drafts';
/**
* Custom hook to auto-save form drafts to localStorage.
* A draft belongs to the signed-in staff member who typed it (see lib/drafts.ts): nobody else gets
* it back, and it expires after 12 hours.
* @param key Unique key for the form in localStorage
* @param initialData Initial state of the form
* @param interval Auto-save interval in milliseconds (default 30s)
*/
export function useFormDraft<T>(key: string, initialData: T, interval: number = 30000) {
const { user } = useAuth();
const uid = user?.id;
const [data, setData] = useState<T>(() => {
const parsed = loadOwnedDraft<any>(`draft_${key}`, uid);
if (parsed !== null && parsed !== undefined) {
// Merge over initialData rather than replacing it outright — a
// draft saved before a form's shape changed (e.g. a new field
// added) would otherwise come back missing that field entirely,
// crashing anything that assumes it exists (see e.g. an old
// draft missing a newly-added array/object field).
if (typeof parsed === 'object' && !Array.isArray(parsed) &&
typeof initialData === 'object' && initialData !== null && !Array.isArray(initialData)) {
return { ...(initialData as object), ...parsed } as T;
}
return parsed as T;
}
return initialData;
});
const saveDraft = useCallback(() => {
if (!uid) return;
try { saveOwnedDraft(`draft_${key}`, uid, data); } catch { /* storage full or blocked: drafts are best-effort */ }
}, [key, data, uid]);
const clearDraft = useCallback(() => {
localStorage.removeItem(`draft_${key}`);
setData(initialData);
}, [key, initialData]);
useEffect(() => {
const timer = setInterval(() => {
saveDraft();
}, interval);
return () => clearInterval(timer);
}, [saveDraft, interval]);
// The idle auto-logout asks every open form to save its draft just before signing out.
useEffect(() => {
window.addEventListener('app:flush-drafts', saveDraft);
return () => window.removeEventListener('app:flush-drafts', saveDraft);
}, [saveDraft]);
// Also save on unmount
useEffect(() => {
return () => {
saveDraft();
};
}, [saveDraft]);
return { data, setData, clearDraft, saveDraft };
}
