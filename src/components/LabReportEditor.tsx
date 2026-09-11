import React from 'react';
import { LabTest, Patient } from '../types';
import { format } from 'date-fns';
import {
  HAEMATOLOGY_FIELDS, WIDAL_FIELDS, WIDAL_SIGNIFICANT_TITRE,
  URINALYSIS_FIELDS, PARASITOLOGY_FIELDS, SEMEN_ANALYSIS_FIELDS, BIOCHEMISTRY_FIELDS,
  CULTURE_SPECIMEN_TYPES, MICROSCOPY_FINDINGS, BLOOD_TRANSFUSION_FIELDS, SENSITIVITY_ANTIBIOTICS,
  ComprehensivePanelResults,
} from '../data/labReportTemplates';

interface Props {
  test: LabTest & { patient?: Patient };
  panelResults: ComprehensivePanelResults;
  onUpdatePanelField: (section: keyof ComprehensivePanelResults, key: string, value: string) => void;
  onUpdateSensitivity: (antibiotic: string, field: 'rate' | 'result', value: string) => void;
  onUpdateCultureCell: (specimen: string, finding: string, value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}

const FormField: React.FC<{
  label: string; value?: string; onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <div>
    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide block">{label}</label>
    <input
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="w-full border-0 border-b border-dotted border-slate-400 focus:border-blue-500 outline-none text-xs py-0.5 bg-transparent"
    />
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-xs font-bold uppercase tracking-wider text-white bg-slate-700 px-2 py-1 mt-4 mb-2 rounded-t">
    {children}
  </h4>
);

export const LabReportEditor: React.FC<Props> = ({
  test, panelResults, onUpdatePanelField, onUpdateSensitivity, onUpdateCultureCell, notes, onNotesChange,
}) => {
  const [side, setSide] = React.useState<'front' | 'back'>('front');
  const pr = panelResults;

  return (
    <div className="bg-white border-2 border-slate-300 rounded-xl overflow-hidden">
      <div className="flex bg-slate-100 border-b-2 border-slate-300">
        <button
          type="button"
          onClick={() => setSide('front')}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest ${side === 'front' ? 'bg-white text-blue-600' : 'text-slate-400'}`}
        >
          Front — Haematology / Widal / Urinalysis / Parasitology
        </button>
        <button
          type="button"
          onClick={() => setSide('back')}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest ${side === 'back' ? 'bg-white text-blue-600' : 'text-slate-400'}`}
        >
          Back — Semen / Biochemistry / Culture / Blood / Sensitivity
        </button>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-4">
          <div>
            <h1 className="text-base font-black text-blue-800 uppercase tracking-tight">
              The Rehoboth Clinic & Maternity
            </h1>
            <p className="text-[9px] text-slate-500">Laboratory Report — {side === 'front' ? 'Page 1 of 2' : 'Page 2 of 2'}</p>
          </div>
          <div className="text-right text-[9px] text-slate-500">
            <p>{test.patient?.name} · {test.patientId}</p>
            <p>{format(new Date(test.createdAt), 'MMM d, yyyy')}</p>
          </div>
        </div>

        {side === 'front' ? (
          <div>
            <SectionTitle>Haematology / BGS</SectionTitle>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {HAEMATOLOGY_FIELDS.map(f => (
                <FormField key={f.key} label={f.label} value={pr.haematology?.[f.key]} onChange={v => onUpdatePanelField('haematology', f.key, v)} />
              ))}
            </div>

            <SectionTitle>Widal Test <span className="font-normal normal-case opacity-80">({WIDAL_SIGNIFICANT_TITRE})</span></SectionTitle>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {WIDAL_FIELDS.map(f => (
                <FormField key={f.key} label={f.label} value={pr.widal?.[f.key]} onChange={v => onUpdatePanelField('widal', f.key, v)} />
              ))}
            </div>

            <SectionTitle>Urinalysis</SectionTitle>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {URINALYSIS_FIELDS.map(f => (
                <FormField key={f.key} label={f.label} value={pr.urinalysis?.[f.key]} onChange={v => onUpdatePanelField('urinalysis', f.key, v)} />
              ))}
            </div>

            <SectionTitle>Parasitology</SectionTitle>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {PARASITOLOGY_FIELDS.map(f => (
                <FormField key={f.key} label={f.label} value={pr.parasitology?.[f.key]} onChange={v => onUpdatePanelField('parasitology', f.key, v)} />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <SectionTitle>Semen Analysis</SectionTitle>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {SEMEN_ANALYSIS_FIELDS.map(f => (
                <FormField key={f.key} label={f.label} value={pr.semenAnalysis?.[f.key]} onChange={v => onUpdatePanelField('semenAnalysis', f.key, v)} />
              ))}
            </div>

            <SectionTitle>Biochemistry</SectionTitle>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {BIOCHEMISTRY_FIELDS.map(f => (
                <FormField key={f.key} label={f.label} value={pr.biochemistry?.[f.key]} onChange={v => onUpdatePanelField('biochemistry', f.key, v)} />
              ))}
            </div>

            <SectionTitle>Culture / Microscopy</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-[9px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-1 py-1 text-left">Specimen</th>
                    {MICROSCOPY_FINDINGS.map(f => (
                      <th key={f} className="border border-slate-300 px-1 py-1 whitespace-nowrap">{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CULTURE_SPECIMEN_TYPES.map(spec => (
                    <tr key={spec}>
                      <td className="border border-slate-300 px-1 py-1 font-semibold whitespace-nowrap">{spec}</td>
                      {MICROSCOPY_FINDINGS.map(f => (
                        <td key={f} className="border border-slate-300 p-0">
                          <input
                            value={pr.cultureMicroscopy?.[spec]?.[f] || ''}
                            onChange={e => onUpdateCultureCell(spec, f, e.target.value)}
                            className="w-12 p-1 text-[9px] outline-none focus:bg-blue-50"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionTitle>Blood Transfusion</SectionTitle>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {BLOOD_TRANSFUSION_FIELDS.map(f => (
                <FormField key={f.key} label={f.label} value={pr.bloodTransfusion?.[f.key]} onChange={v => onUpdatePanelField('bloodTransfusion', f.key, v)} />
              ))}
            </div>

            <SectionTitle>Gram's Reaction — Sensitivity Pattern</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SENSITIVITY_ANTIBIOTICS.map(ab => (
                <div key={ab} className="flex items-center gap-1 border-b border-dotted border-slate-400 py-0.5">
                  <span className="text-[9px] font-semibold flex-1 truncate">{ab}</span>
                  <select
                    value={pr.sensitivity?.[ab]?.result || ''}
                    onChange={e => onUpdateSensitivity(ab, 'result', e.target.value)}
                    className="text-[9px] outline-none bg-transparent"
                  >
                    <option value="">-</option>
                    <option value="S">S</option>
                    <option value="R">R</option>
                  </select>
                </div>
              ))}
            </div>
            <p className="text-[8px] text-slate-500 mt-1">N.B. S = Sensitive, R = Resistant</p>

            <div className="mt-5">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Additional Notes / Comments</p>
              <textarea
                value={notes}
                onChange={e => onNotesChange(e.target.value)}
                className="w-full min-h-[90px] border-2 border-slate-300 rounded-lg p-3 text-xs outline-none focus:border-blue-500"
                placeholder="Write any additional observations here..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
