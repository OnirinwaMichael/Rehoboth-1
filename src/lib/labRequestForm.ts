import { LabTest, LabRequestDetails, Patient } from '../types';

// Everything printed on the paper "Laboratory Request Form". The lab result
// itself lives in lab_tests.result; every other field is stored in
// lab_tests.request_details (jsonb), so no schema change is needed.
export interface PaperValues {
  patientName: string;
  sex: string;
  age: string;
  hospitalClinic: string;
  ward: string;
  no: string;
  clinicalHistory: string;
  consultant: string;
  provisionalDiagnosis: string;
  natureOfSpecimen: string;
  testRequired: string;
  dateOfReception: string;
  labNo: string;
  labResult: string;
  resultDate: string;
  labSecretary: string;
  notes: string;
}

type TestWithContext = Pick<LabTest, 'testType' | 'result' | 'requestDetails' | 'familyMemberName'> & {
  patient?: Pick<Patient, 'name' | 'gender' | 'age'>;
};

const cap = (g?: string) => (g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : '');

// Fields a test can pre-fill from facts we already hold. Nothing is guessed:
// on a family card the stored age/sex belong to the card holder, so they stay
// blank for a member.
export const defaultPaperValues = (t: TestWithContext): PaperValues => {
  const isMember = !!t.familyMemberName;
  return {
    patientName: t.familyMemberName || t.patient?.name || '',
    sex: isMember ? '' : cap(t.patient?.gender),
    age: isMember ? '' : (t.patient?.age || ''),
    hospitalClinic: '', ward: '', no: '', clinicalHistory: '', consultant: '',
    provisionalDiagnosis: '', natureOfSpecimen: '',
    testRequired: t.testType || '',
    dateOfReception: '', labNo: '', labResult: '', resultDate: '', labSecretary: '', notes: '',
  };
};

// Saved values win over the defaults; the result text comes from lab_tests.result.
export const buildPaperValues = (t: TestWithContext): PaperValues => {
  const base = defaultPaperValues(t);
  const rd: LabRequestDetails = t.requestDetails || {};
  const merged = { ...base };
  (Object.keys(base) as (keyof PaperValues)[]).forEach(k => {
    if (k === 'labResult') return;
    const saved = (rd as Record<string, string | undefined>)[k];
    if (typeof saved === 'string' && saved !== '') merged[k] = saved;
  });
  merged.labResult = t.result || '';
  return merged;
};

// Everything except the lab result (that goes in `result`). Empty fields are
// dropped so the jsonb stays small and "blank" never overrides a default.
export const toRequestDetails = (v: PaperValues): LabRequestDetails => {
  const out: Record<string, string> = {};
  (Object.keys(v) as (keyof PaperValues)[]).forEach(k => {
    if (k === 'labResult') return;
    const val = (v[k] || '').trim();
    if (val) out[k] = val;
  });
  return out as LabRequestDetails;
};
