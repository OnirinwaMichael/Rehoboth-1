import { Prescription } from '../types';

// Drugs prescribed in the same consultation share a record_id. They are shown
// together as one patient request instead of one card per drug. A drug with no
// consultation (not expected, but possible) stays on its own.
export interface RxGroup<T extends Prescription = Prescription> {
  key: string;
  recordId?: string;
  familyMemberId?: string | null;
  items: T[];
  createdAt: string; // earliest drug in the group
}

export const groupPrescriptions = <T extends Prescription>(list: T[]): RxGroup<T>[] => {
  const map = new Map<string, RxGroup<T>>();
  const order: string[] = [];
  for (const rx of list) {
    const key = rx.recordId ? `${rx.recordId}|${rx.familyMemberId || ''}` : `solo|${rx.id}`;
    let g = map.get(key);
    if (!g) {
      g = { key, recordId: rx.recordId, familyMemberId: rx.familyMemberId, items: [], createdAt: rx.createdAt };
      map.set(key, g);
      order.push(key);
    }
    g.items.push(rx);
    if (rx.createdAt < g.createdAt) g.createdAt = rx.createdAt;
  }
  // Newest request first, drugs inside in the order they were prescribed.
  return order
    .map(k => {
      const g = map.get(k)!;
      g.items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.drugName.localeCompare(b.drugName));
      return g;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const lineTotal = (rx: Prescription) => (Number(rx.drugPrice) || 0) * (Number(rx.quantity) || 0);

export const summariseGroup = (items: Prescription[]) => {
  const count = items.length;
  const dispensed = items.filter(i => i.dispensed).length;
  // A free drug (no price) never goes through billing, so it doesn't hold payment back.
  const billable = items.filter(i => lineTotal(i) > 0);
  const paid = billable.filter(i => i.paymentStatus === 'paid').length;
  const anyPart = billable.some(i => i.paymentStatus === 'partial' || i.paymentStatus === 'paid');
  const payment: 'paid' | 'partial' | 'pending' | 'none' =
    billable.length === 0 ? 'none'
    : paid === billable.length ? 'paid'
    : anyPart ? 'partial'
    : 'pending';
  return {
    count,
    dispensed,
    allDispensed: dispensed === count,
    billableCount: billable.length,
    paidCount: paid,
    payment,
    total: billable.reduce((s, i) => s + lineTotal(i), 0),
  };
};
