import React from 'react';
import { LabTest, Patient } from '../types';
import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';
import {
  LAB_REQUEST_FIELDS, HAEMATOLOGY_FIELDS, WIDAL_FIELDS, WIDAL_SIGNIFICANT_TITRE,
  URINALYSIS_FIELDS, PARASITOLOGY_FIELDS, SEMEN_ANALYSIS_FIELDS, BIOCHEMISTRY_FIELDS,
  CULTURE_SPECIMEN_TYPES, MICROSCOPY_FINDINGS, BLOOD_TRANSFUSION_FIELDS, SENSITIVITY_ANTIBIOTICS,
} from '../data/labReportTemplates';

interface Props {
  test: LabTest & { patient?: Patient };
  onClose: () => void;
}

// Renders read-only field rows, dotted-line style like the paper form
const FieldRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex items-baseline gap-2 py-0.5 text-[11px] leading-tight">
    <span className="font-semibold text-slate-700 whitespace-nowrap">{label}:</span>
    <span className="flex-1 border-b border-dotted border-slate-400 min-h-[14px] px-1">{value || ''}</span>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-xs font-bold uppercase tracking-wider text-white bg-slate-700 px-2 py-1 mt-3 mb-1 print:bg-slate-700 print:text-white">
    {children}
  </h4>
);

export const LabReportPrint: React.FC<Props> = ({ test, onClose }) => {
  const rd = test.requestDetails || {};
  const pr = test.panelResults || {};

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="w-full max-w-[210mm] bg-white rounded-xl shadow-2xl print:shadow-none print:rounded-none my-6">
        {/* Toolbar — hidden when printing */}
        <div className="print:hidden flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <p className="font-bold text-slate-900">Report Preview</p>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable sheet */}
        <div className="p-8 print:p-6 text-slate-900" id="lab-report-print-area">
          {/* Letterhead */}
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-4">
            <div>
              <h1 className="text-xl font-black text-blue-800 uppercase tracking-tight">
                The Rehoboth Clinic & Maternity
              </h1>
              <p className="text-[10px] text-slate-600">
                P.O. Box 89, Adogbe Along Living Faith Church, Odole-Mopa, Mopamuro L.G.A., Kogi State
              </p>
              <p className="text-[10px] text-slate-600">Tel: 08054894848</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-slate-500">
                {test.reportType === 'basic' ? 'Laboratory Request Form' : 'Laboratory Report'}
              </p>
              <p className="text-[10px] text-slate-500">{format(new Date(test.createdAt), 'MMM d, yyyy HH:mm')}</p>
            </div>
          </div>

          {/* Patient header */}
          <div className="grid grid-cols-2 gap-x-6 mb-3 border border-slate-300 rounded-lg p-3">
            <FieldRow label="Patient's Name" value={test.patient?.name} />
            <FieldRow label="Card No" value={test.patientId} />
            <FieldRow label="Age" value={test.patient ? String(test.patient.age) : ''} />
            <FieldRow label="Sex" value={test.patient?.gender} />
            <FieldRow label="Clinic No" value={pr.clinicNo} />
            <FieldRow label="Clinician" value={pr.clinician} />
            <FieldRow label="Test Required" value={test.testType} />
            <FieldRow label="Specimen" value={pr.specimen} />
            {pr.clinicalDiagnosis && (
              <div className="col-span-2"><FieldRow label="Clinical Diagnosis" value={pr.clinicalDiagnosis} /></div>
            )}
          </div>

          {/* BASIC REQUEST FORM */}
          {test.reportType === 'basic' && (
            <div className="border border-slate-300 rounded-lg p-3 space-y-1">
              {LAB_REQUEST_FIELDS.map(f => (
                <FieldRow key={f.key} label={f.label} value={(rd as any)[f.key]} />
              ))}
              <div className="mt-3 pt-2 border-t border-slate-300 text-[10px] font-bold uppercase text-slate-500">
                For Lab Use Only
              </div>
              <FieldRow label="Lab Result" value={test.result} />
            </div>
          )}

          {/* COMPREHENSIVE REPORT */}
          {test.reportType === 'comprehensive' && (
            <div>
              <SectionTitle>Haematology / BGS</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6">
                {HAEMATOLOGY_FIELDS.map(f => (
                  <FieldRow key={f.key} label={f.label} value={pr.haematology?.[f.key]} />
                ))}
              </div>

              <SectionTitle>Widal Test <span className="font-normal normal-case opacity-80">({WIDAL_SIGNIFICANT_TITRE})</span></SectionTitle>
              <div className="grid grid-cols-2 gap-x-6">
                {WIDAL_FIELDS.map(f => (
                  <FieldRow key={f.key} label={f.label} value={pr.widal?.[f.key]} />
                ))}
              </div>

              <SectionTitle>Urinalysis</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6">
                {URINALYSIS_FIELDS.map(f => (
                  <FieldRow key={f.key} label={f.label} value={pr.urinalysis?.[f.key]} />
                ))}
              </div>

              <SectionTitle>Parasitology</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6">
                {PARASITOLOGY_FIELDS.map(f => (
                  <FieldRow key={f.key} label={f.label} value={pr.parasitology?.[f.key]} />
                ))}
              </div>

              <SectionTitle>Semen Analysis</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6">
                {SEMEN_ANALYSIS_FIELDS.map(f => (
                  <FieldRow key={f.key} label={f.label} value={pr.semenAnalysis?.[f.key]} />
                ))}
              </div>

              <SectionTitle>Biochemistry</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6">
                {BIOCHEMISTRY_FIELDS.map(f => (
                  <FieldRow key={f.key} label={f.label} value={pr.biochemistry?.[f.key]} />
                ))}
              </div>

              <SectionTitle>Culture / Microscopy</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1 text-left">Specimen</th>
                      {MICROSCOPY_FINDINGS.map(f => (
                        <th key={f} className="border border-slate-300 px-1 py-1">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CULTURE_SPECIMEN_TYPES.map(spec => (
                      <tr key={spec}>
                        <td className="border border-slate-300 px-2 py-1 font-semibold">{spec}</td>
                        {MICROSCOPY_FINDINGS.map(f => (
                          <td key={f} className="border border-slate-300 px-1 py-1 text-center">
                            {pr.cultureMicroscopy?.[spec]?.[f] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <SectionTitle>Blood Transfusion</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6">
                {BLOOD_TRANSFUSION_FIELDS.map(f => (
                  <FieldRow key={f.key} label={f.label} value={pr.bloodTransfusion?.[f.key]} />
                ))}
              </div>

              <SectionTitle>Gram's Reaction — Sensitivity Pattern</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                {SENSITIVITY_ANTIBIOTICS.map(ab => (
                  <div key={ab} className="flex items-center justify-between border-b border-dotted border-slate-400 py-0.5">
                    <span className="font-semibold">{ab}</span>
                    <span className="font-bold">
                      {pr.sensitivity?.[ab]?.result || ''} {pr.sensitivity?.[ab]?.rate || ''}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-slate-500 mt-1">N.B. S = Sensitive, R = Resistant</p>

              {test.result && (
                <div className="mt-3 pt-2 border-t border-slate-300">
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Additional Notes</p>
                  <p className="text-xs whitespace-pre-wrap">{test.result}</p>
                </div>
              )}
            </div>
          )}

          {/* Legacy free-form fallback (pre-template records) */}
          {(!test.reportType || test.reportType === 'legacy') && (
            <div className="border border-slate-300 rounded-lg p-3">
              {test.structuredResults && test.structuredResults.length > 0 ? (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1 text-left">Parameter</th>
                      <th className="border border-slate-300 px-2 py-1 text-left">Result</th>
                      <th className="border border-slate-300 px-2 py-1 text-left">Range</th>
                      <th className="border border-slate-300 px-2 py-1 text-left">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {test.structuredResults.map((r, i) => (
                      <tr key={i}>
                        <td className="border border-slate-300 px-2 py-1">{r.parameter}</td>
                        <td className="border border-slate-300 px-2 py-1">{r.result}</td>
                        <td className="border border-slate-300 px-2 py-1">{r.range}</td>
                        <td className="border border-slate-300 px-2 py-1">{r.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{test.result || 'No result recorded.'}</p>
              )}
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between text-[10px] text-slate-500">
            <span>Date: {format(new Date(), 'MMM d, yyyy')}</span>
            <span>Med. Lab. Scientist: ___________________________</span>
          </div>
        </div>
      </div>
    </div>
  );
};
