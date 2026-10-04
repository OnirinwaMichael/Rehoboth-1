import React, { useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, X } from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { logAction } from '../lib/audit';

interface Props {
  userId: string;
  onClose: () => void;
  // Called with the new WALKIN-#### id so the caller can pick that patient straight away.
  onCreated: (cardId: string, name: string) => void;
}

// A person with no clinic card. Their tests and charges show up in Pending Bills
// under their WALKIN number; no registration fee is raised.
export const WalkInPatientDialog: React.FC<Props> = ({ userId, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !gender) { toast.error('Enter the name and pick male or female.'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('create_walkin_patient', {
        p_name: name.trim(), p_gender: gender, p_phone: phone.trim() || null, p_age: age.trim() || null,
      });
      if (error || !data || typeof data !== 'string') {
        if (error) handleSupabaseError(error, 'insert', 'patients');
        else toast.error('Could not add the walk-in. Try again.');
        return;
      }
      await logAction(userId, 'REGISTER_WALKIN', `Added walk-in patient ${name.trim()} as ${data}`);
      toast.success(`Walk-in added as ${data}.`);
      onCreated(data, name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><UserPlus className="w-5 h-5 text-blue-600" /> Add Walk-in Patient</h3>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">For someone with no clinic card. No registration fee is charged. Their tests and bills appear in Pending Bills under a WALKIN number.</p>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700">Full name</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700">Gender</label>
              <select value={gender} onChange={e => setGender(e.target.value as 'male' | 'female' | '')}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700">Age <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={age} onChange={e => setAge(e.target.value)} inputMode="numeric"
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Age" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Phone number" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Adding…' : 'Add walk-in'}
          </button>
        </div>
      </form>
    </div>
  );
};
