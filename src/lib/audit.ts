import { supabase } from './supabase';
export async function logAction(staffId: string | undefined, action: string, details: string) {
const { error } = await supabase.from('audit_logs').insert({
staff_id: staffId || null,
action,
details,
user_agent: navigator.userAgent,
// No reliable client-side IP; left null. If real IPs are wanted,
// capture them server-side in an Edge Function instead.
});
if (error) {
console.error('[audit] failed to log action:', error.message);
}
}
// Fixes the gap flagged in review: reads of sensitive records
// (patient charts, medical records) were never logged before, only
// writes were. Call this from patient-record view components.
export async function logRecordAccess(staffId: string | undefined, patientId: string) {
await logAction(staffId, 'VIEW_PATIENT_RECORD', `Viewed record for patient ${patientId}`);
}
