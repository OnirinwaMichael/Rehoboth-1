import React, { useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, ChevronRight, Pill } from 'lucide-react';
import { Patient, Prescription } from '../types';
import { RxGroup, summariseGroup } from '../lib/groupPrescriptions';
import { cn } from '../lib/utils';
import { paymentRecorded } from '../lib/paymentGate';

export type RxWithPatient = Prescription & { patient?: Patient };

interface Props {
  group: RxGroup<RxWithPatient>;
  qtyEdits: Record<string, string>;
  onQtyChange: (id: string, value: string) => void;
  isExpired: (rx: Prescription) => boolean;
  onConfirm: (rx: Prescription) => void;
  onDispense: (rx: Prescription) => void;
  onConfirmAll: (items: Prescription[]) => void;
  onDispenseAll: (items: Prescription[]) => void;
  busy: boolean;
}

const isFree = (rx: Prescription) => (rx.drugPrice || 0) * (rx.quantity || 1) === 0;
// Dispensing opens once the receptionist has recorded a payment, full or part.
// A part-paid drug can go out; the balance stays in Finance > Pending Bills.
const needsPayment = (rx: Prescription) => !paymentRecorded(rx.paymentStatus) && !isFree(rx);

// The one reason a drug can't be dispensed yet (same order the single-drug button used).
export const dispenseBlocker = (rx: Prescription, expired: boolean): string | null => {
  if (rx.dispensed) return null;
  if (expired) return 'Drug expired — update stock';
  if (!rx.quantityConfirmed) return 'Confirm quantity first';
  if (needsPayment(rx)) return 'Awaiting payment';
  return null;
};

const dosageLine = (rx: Prescription) =>
  [rx.dosageMorning && `${rx.dosageMorning} morning`, rx.dosageAfternoon && `${rx.dosageAfternoon} afternoon`, rx.dosageNight && `${rx.dosageNight} night`]
    .filter(Boolean).join(', ') || 'As directed';

export const PharmacyRxGroupCard: React.FC<Props> = ({
  group, qtyEdits, onQtyChange, isExpired, onConfirm, onDispense, onConfirmAll, onDispenseAll, busy,
}) => {
  const { items } = group;
  const first = items[0];
  const sum = summariseGroup(items);
  const pending = items.filter(i => !i.dispensed);
  const firstActionable = pending[0]?.id;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (firstActionable ? { [firstActionable]: true } : {}));
  const allOpen = pending.every(i => open[i.id]);

  const toConfirm = pending.filter(i => !i.quantityConfirmed);
  const readyToDispense = pending.filter(i => !dispenseBlocker(i, isExpired(i)));
  const paymentTone =
    sum.payment === 'paid' ? 'text-green-600' : sum.payment === 'partial' ? 'text-blue-600' : sum.payment === 'none' ? 'text-slate-400' : 'text-yellow-600';
  const paymentLabel =
    sum.payment === 'none' ? 'no charge'
    : sum.payment === 'paid' ? 'paid'
    : `${sum.paidCount} of ${sum.billableCount} paid`;

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold shrink-0">
            {first.patient?.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{first.patient?.name}</p>
            <p className="text-[11px] text-slate-400">{first.patientId}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] text-slate-400 block">{format(new Date(group.createdAt), 'd MMM, HH:mm')}</span>
          <span className={cn('text-[11px] font-bold uppercase', paymentTone)}>{paymentLabel}</span>
        </div>
      </div>

      {first.familyMemberName ? (
        <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600">Give to</p>
          <p className="text-sm font-black text-amber-800">{first.familyMemberName}</p>
        </div>
      ) : first.patient?.category === 'family card' ? (
        <p className="mb-3 text-[11px] font-bold uppercase text-slate-400">Family card — member not recorded</p>
      ) : null}

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
          <Pill className="w-4 h-4 text-green-600" />
          {sum.count} drug{sum.count === 1 ? '' : 's'}
          <span className="font-normal text-slate-400">· {sum.dispensed} of {sum.count} dispensed</span>
        </p>
        {pending.length > 1 && (
          <button
            type="button"
            onClick={() => {
              const next: Record<string, boolean> = {};
              pending.forEach(i => { next[i.id] = !allOpen; });
              setOpen(next);
            }}
            className="text-[11px] font-bold text-blue-600"
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.map(rx => {
          if (rx.dispensed) {
            return (
              <div key={rx.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-50 border border-purple-100 text-xs">
                <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="font-bold text-purple-800 flex-1 min-w-0 break-words">{rx.drugName}</span>
                <span className="text-[11px] font-bold uppercase text-purple-600 shrink-0">Dispensed</span>
              </div>
            );
          }
          const expired = isExpired(rx);
          const blocker = dispenseBlocker(rx, expired);
          const isOpen = !!open[rx.id];
          const billedUnit = rx.billingBasis === 'per_pack'
            ? `${rx.quantity} pack${rx.quantity !== 1 ? 's' : ''}`
            : `${rx.quantity} unit${rx.quantity !== 1 ? 's' : ''}`;
          return (
            <div key={rx.id} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(o => ({ ...o, [rx.id]: !o[rx.id] }))}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                <span className="font-bold text-slate-900 flex-1 min-w-0 break-words">{rx.drugName}</span>
                {rx.quantityConfirmed && <span className="text-[11px] font-bold uppercase text-green-700 shrink-0">✓ qty</span>}
                {!blocker && <span className="text-[11px] font-bold uppercase text-emerald-700 shrink-0">ready</span>}
                {blocker === 'Awaiting payment' && (
                  <span className="text-[11px] font-bold uppercase text-yellow-700 shrink-0">unpaid</span>
                )}
                {rx.paymentStatus === 'partial' && (
                  <span className="text-[11px] font-bold uppercase text-blue-600 shrink-0">balance owing</span>
                )}
                {expired && <span className="text-[11px] font-bold uppercase text-red-600 shrink-0">expired</span>}
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100">
                      {rx.route}
                    </span>
                    <span className={cn(
                      'text-[11px] font-bold uppercase',
                      rx.paymentStatus === 'paid' ? 'text-green-600' : rx.paymentStatus === 'partial' ? 'text-blue-600' : 'text-yellow-600'
                    )}>
                      {isFree(rx) ? 'no charge' : rx.paymentStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {dosageLine(rx)} · {rx.durationDays} day{rx.durationDays !== 1 ? 's' : ''} · {billedUnit} billed
                  </p>
                  {rx.quantityConfirmed ? (
                    <p className="text-[11px] font-bold text-green-700">
                      ✓ Quantity confirmed: {rx.quantity}
                      {rx.proposedQuantity && rx.proposedQuantity !== rx.quantity ? ` (proposed ${rx.proposedQuantity})` : ''}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number" min="1"
                        aria-label={`Quantity for ${rx.drugName}`}
                        disabled={rx.paymentStatus !== 'pending'}
                        value={qtyEdits[rx.id] ?? String(rx.quantity)}
                        onChange={e => onQtyChange(rx.id, e.target.value)}
                        className="w-20 p-2 rounded-lg border border-slate-200 text-sm font-bold bg-white disabled:bg-slate-100"
                      />
                      <button
                        onClick={() => onConfirm(rx)}
                        disabled={busy}
                        className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                      >
                        Confirm {rx.billingBasis === 'per_pack' ? 'packs' : 'quantity'}
                      </button>
                    </div>
                  )}
                  {rx.instructions && <p className="text-xs text-slate-500 italic">Note: {rx.instructions}</p>}
                  <button
                    onClick={() => onDispense(rx)}
                    disabled={busy || !!blocker}
                    className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {blocker || 'Mark as Dispensed'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pending.length > 1 && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={() => onConfirmAll(toConfirm)}
            disabled={busy || toConfirm.length === 0}
            className="py-2.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-xs font-bold hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm all quantities{toConfirm.length > 0 ? ` (${toConfirm.length})` : ''}
          </button>
          <button
            onClick={() => onDispenseAll(readyToDispense)}
            disabled={busy || readyToDispense.length === 0}
            className="py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Dispense all ready{readyToDispense.length > 0 ? ` (${readyToDispense.length})` : ''}
          </button>
        </div>
      )}
    </div>
  );
};
