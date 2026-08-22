import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
/**
* Custom hook to auto-save form drafts to localStorage
* @param key Unique key for the form in localStorage
* @param initialData Initial state of the form
* @param interval Auto-save interval in milliseconds (default 30s)
*/
export function useFormDraft<T>(key: string, initialData: T, interval: number = 30000) {
const [data, setData] = useState<T>(() => {
const saved = localStorage.getItem(`draft_${key}`);
if (saved) {
try {
return JSON.parse(saved);
} catch (e) {
console.error('Failed to parse draft:', e);
}
}
return initialData;
});
const saveDraft = useCallback(() => {
localStorage.setItem(`draft_${key}`, JSON.stringify(data));
}, [key, data]);
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
// Also save on unmount
useEffect(() => {
return () => {
saveDraft();
};
}, [saveDraft]);
return { data, setData, clearDraft, saveDraft };
}
