import React, { useState } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { StandardFeeState } from '../lib/useStandardFee';

interface Props {
  state: StandardFeeState;
  onClose: () => void;
}

export const StandardFeeDialog: React.FC<Props> = ({ state, onClose }) => {
  const [value, setValue] = useState(state.fee !== null ? String(state.fee) : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amount = parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) { toast.error('Enter a valid amount (0 or more).'); return; }
    if (state.fee !== null && amount === state.fee) { onClose(); return; }
    const msg = state.fee === null
      ? `Set the standard consultation fee to ₦${amount.toLocaleString()}?`
      : `Change the standard consultation fee from ₦${state.fee.toLocaleString()} to ₦${amount.toLocaleString()}?\n\nNew consultations will start with this amount. Past records and bills are not changed.`;
    if (!window.confirm(msg)) return;
    setSaving(true);
    const res = await state.save(amount);
    setSaving(false);
    if (!res.ok) { toast.error(res.message || 'Could not save.'); return; }
    toast.success('Standard consultation fee saved.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 space-y-4 max-h-[92dvh] overflow-y-auto pb-safe" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Standard consultation fee</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500">
          This amount fills in automatically on every new consultation. It can still be changed for an individual patient.
        </p>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Amount (₦)</label>
          <input
            type="number" min="0" autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            className="mt-1 w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
            placeholder="0"
          />
        </div>
        {state.updatedAt && (
          <p className="text-[11px] text-slate-400">
            Last changed {format(new Date(state.updatedAt), 'MMM d, yyyy HH:mm')}{state.updatedByName ? ` by ${state.updatedByName}` : ''}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
