// Unsaved-form drafts kept on this device. Every draft belongs to the staff member who typed it:
// nobody else is ever given it back, a different person logging in deletes it, and it expires
// after 12 hours. Drafts saved before this existed have no owner, so they are discarded too.
const PREFIX = 'draft_';
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface OwnedDraft { __draft: 1; owner: string; savedAt: number; data: unknown }

const isOwnedDraft = (v: any): v is OwnedDraft =>
  !!v && typeof v === 'object' && v.__draft === 1 && typeof v.owner === 'string' && typeof v.savedAt === 'number';

export function saveOwnedDraft(storageKey: string, owner: string, data: unknown) {
  const wrapped: OwnedDraft = { __draft: 1, owner, savedAt: Date.now(), data };
  localStorage.setItem(storageKey, JSON.stringify(wrapped));
}

// Returns the draft only if it belongs to `owner` and has not expired; otherwise null.
export function loadOwnedDraft<T = unknown>(storageKey: string, owner: string | undefined): T | null {
  if (!owner) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isOwnedDraft(parsed) || parsed.owner !== owner) return null;
    if (Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) return null;
    return parsed.data as T;
  } catch { return null; }
}

// Called when someone signs in: deletes every draft that is not theirs, is expired, or has no owner.
export function purgeDraftsExcept(owner: string): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      let keep = false;
      try {
        const parsed = JSON.parse(localStorage.getItem(k) || 'null');
        keep = isOwnedDraft(parsed) && parsed.owner === owner && Date.now() - parsed.savedAt <= DRAFT_MAX_AGE_MS;
      } catch { keep = false; }
      if (!keep) { localStorage.removeItem(k); removed++; }
    }
  } catch { /* storage unavailable: nothing to purge */ }
  return removed;
}
