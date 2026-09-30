import { Patient } from '../types';

const byCardId = (a: Patient, b: Patient) =>
  a.cardId.localeCompare(b.cardId, undefined, { numeric: true, sensitivity: 'base' });

// Applies one realtime `patients` change to an already-loaded list, so the app
// no longer re-downloads every patient (7,000+) each time one record changes.
export function applyPatientChange(
  prev: Patient[],
  payload: { eventType: string; new?: any; old?: any },
  map: (row: any) => Patient
): Patient[] {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.card_id;
    return id ? prev.filter(p => p.cardId !== id) : prev;
  }
  if (!payload.new?.card_id) return prev;
  const next = map(payload.new);
  const oldId = payload.old?.card_id;
  const rest = prev.filter(p => p.cardId !== next.cardId && (!oldId || p.cardId !== oldId));
  return [...rest, next].sort(byCardId);
}

// Replace (or add) one patient in a sorted list after a local edit.
export function upsertPatient(prev: Patient[], patient: Patient, previousCardId?: string): Patient[] {
  const rest = prev.filter(p => p.cardId !== patient.cardId && (!previousCardId || p.cardId !== previousCardId));
  return [...rest, patient].sort(byCardId);
}
