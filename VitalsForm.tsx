import React, { useState } from 'react';
import { Activity, Heart, Thermometer, Droplets, Wind, User, Save, X } from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { Patient, Vitals } from '../types';
import { toast } from 'sonner';
import { logAction } from '../lib/audit';
import { cn } from '../lib/utils';
interface Props {
patient: Patient;
userId: string;
onSuccess: () => void;
onCancel?: () => void;
}
export const VitalsForm: React.FC<Props> = ({ patient, userId, onSuccess, onCancel }) => {
const [loading, setLoading] = useState(false);
const [formData, setFormData] = useState({
bloodPressure: '',
temperature: '',
sugarLevel: '',
pulse: '',
respiratoryRate: '',
spo2: '',
weight: ''
});
const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
if (!formData.bloodPressure || !formData.temperature) {
toast.error('Blood Pressure and Temperature are required.');
return;
}
setLoading(true);
try {
const { error } = await supabase.from('medical_records').insert({
patient_id: patient.cardId,
staff_id: userId,
blood_pressure: formData.bloodPressure,
temperature: formData.temperature,
sugar_level: formData.sugarLevel,
pulse: formData.pulse,
respiratory_rate: formData.respiratoryRate,
spo2: formData.spo2,
weight: formData.weight,
});
if (error) throw error;
await logAction(userId, 'RECORD_VITALS', `Recorded vital signs for patient ${patient.cardId}`);
toast.success('Vital signs recorded successfully!');
onSuccess();
} catch (error) {
handleSupabaseError(error, 'insert', 'medical_records');
} finally {
setLoading(false);
}
};
return (
<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
<div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
<div className="flex items-center gap-2">
<Activity className="w-5 h-5 text-red-600" />
<h3 className="font-bold text-slate-900">Record Vital Signs</h3>
</div>
{onCancel && (
<button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
<X className="w-5 h-5" />
</button>
)}
</div>
<form onSubmit={handleSubmit} className="p-8 space-y-8">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
<div className="space-y-2">
<label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
<Heart className="w-3 h-3" /> Blood Pressure
</label>
<input
required
value={formData.bloodPressure}
onChange={e => setFormData({ ...formData, bloodPressure: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="120/80 mmHg"
/>
</div>
<div className="space-y-2">
<label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
<Thermometer className="w-3 h-3" /> Temperature
</label>
<input
required
value={formData.temperature}
onChange={e => setFormData({ ...formData, temperature: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="36.5 °C"
/>
</div>
<div className="space-y-2">
<label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
<Droplets className="w-3 h-3" /> Sugar Level
</label>
<input
value={formData.sugarLevel}
onChange={e => setFormData({ ...formData, sugarLevel: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="95 mg/dL"
/>
</div>
<div className="space-y-2">
<label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
<Activity className="w-3 h-3" /> Pulse Rate
</label>
<input
value={formData.pulse}
onChange={e => setFormData({ ...formData, pulse: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="72 bpm"
/>
</div>
<div className="space-y-2">
<label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
<Wind className="w-3 h-3" /> Resp. Rate
</label>
<input
value={formData.respiratoryRate}
onChange={e => setFormData({ ...formData, respiratoryRate: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="16 breaths/min"
/>
</div>
<div className="space-y-2">
<label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
<Droplets className="w-3 h-3 text-blue-500" /> SpO2
</label>
<input
value={formData.spo2}
onChange={e => setFormData({ ...formData, spo2: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="98 %"
/>
</div>
<div className="space-y-2">
<label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
<User className="w-3 h-3" /> Weight
</label>
<input
value={formData.weight}
onChange={e => setFormData({ ...formData, weight: e.target.value })}
className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
placeholder="70 kg"
/>
</div>
</div>
<div className="flex gap-4">
{onCancel && (
<button
type="button"
onClick={onCancel}
className="flex-1 px-6 py-4 rounded-xl font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
>
Cancel
</button>
)}
<button
type="submit"
disabled={loading}
className="flex-[2] bg-red-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
>
<Save className="w-5 h-5" />
{loading ? 'Saving...' : 'Save Vital Signs'}
</button>
</div>
</form>
</div>
);
};
