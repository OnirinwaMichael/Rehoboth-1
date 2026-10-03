import React, { useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import SearchSelect from './SearchSelect';
import { VoiceDictationButton } from './VoiceDictationButton';
import { PaperValues } from '../lib/labRequestForm';
import { CULTURE_SPECIMEN_TYPES } from '../data/labReportTemplates';
import { cn } from '../lib/utils';

// The Rehoboth Clinic & Maternity "Laboratory Request Form", laid out line for
// line like the paper original the lab technicians use today. Editable for the
// Lab; read-only (same layout, filled in) for printing and for Doctors/Nurses.

interface Props {
  values: PaperValues;
  onChange?: (patch: Partial<PaperValues>) => void;
  readOnly?: boolean;
  wards?: string[];
  consultants?: string[];
  onAddWard?: (name: string) => Promise<void> | void;
  /** Shown in the Lab No slot until one is assigned on save. */
  labNoPlaceholder?: string;
  className?: string;
}

const LINE = 'border-b border-slate-500';

const AutoTextarea: React.FC<{
  value: string; onChange: (v: string) => void; minRows?: number; placeholder?: string;
}> = ({ value, onChange, minRows = 1, placeholder }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Grow with the text so long notes never need an inner scrollbar.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={cn('flex-1 min-w-0 w-full bg-transparent px-1 py-1 text-sm text-slate-900 outline-none resize-none overflow-hidden focus:bg-sky-50/50', LINE)}
    />
  );
};

const niceDate = (v: string) => {
  if (!v) return '';
  try { return format(new Date(`${v}T00:00:00`), 'dd MMM yyyy'); } catch { return v; }
};

const withCurrent = (opts: string[], current: string) =>
  (current && !opts.includes(current) ? [current, ...opts] : opts).map(o => ({ value: o, label: o }));

export const LabRequestFormPaper: React.FC<Props> = ({
  values, onChange, readOnly = false, wards = [], consultants = [], onAddWard, labNoPlaceholder, className,
}) => {
  const set = (patch: Partial<PaperValues>) => onChange?.(patch);
  const [addingWard, setAddingWard] = useState(false);
  const [newWard, setNewWard] = useState('');

  // One paper line: label on the left, the value on an underline.
  // A plain function (not a component) so inputs keep focus while typing.
  const field = (
    label: string, k: keyof PaperValues,
    o: { multiline?: boolean; minRows?: number; voice?: boolean; type?: 'text' | 'date'; wrap?: string; control?: React.ReactNode } = {},
  ) => (
    <div key={k} className={cn('flex items-end gap-2', o.wrap)}>
      <span className="text-sm font-semibold text-slate-700 whitespace-nowrap pb-1">{label}:</span>
      {o.control ? o.control : readOnly ? (
        <span className={cn('flex-1 min-w-0 px-1 py-1 text-sm text-slate-900 whitespace-pre-wrap break-words min-h-[1.75rem]', LINE)}>
          {o.type === 'date' ? niceDate(values[k]) : values[k]}
        </span>
      ) : o.multiline ? (
        <AutoTextarea value={values[k]} onChange={v => set({ [k]: v } as Partial<PaperValues>)} minRows={o.minRows} />
      ) : (
        <input
          type={o.type || 'text'}
          value={values[k]}
          onChange={e => set({ [k]: e.target.value } as Partial<PaperValues>)}
          className={cn('flex-1 min-w-0 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none focus:bg-sky-50/50', LINE)}
        />
      )}
      {o.voice && !readOnly && (
        <VoiceDictationButton onFinalResult={text => set({ [k]: (values[k] ? values[k] + ' ' : '') + text } as Partial<PaperValues>)} />
      )}
    </div>
  );

  const picker = (
    k: 'ward' | 'consultant' | 'natureOfSpecimen', options: string[], placeholder: string,
  ) => readOnly ? undefined : (
    <SearchSelect
      size="sm"
      className="flex-1 min-w-0"
      value={values[k]}
      onChange={v => set({ [k]: v } as Partial<PaperValues>)}
      placeholder={placeholder}
      options={withCurrent(options, values[k])}
    />
  );

  return (
    <div className={className}>
      <div className="border-2 border-sky-700 rounded-sm p-4 bg-white text-slate-900">
        {/* Letterhead */}
        <div className="flex items-center gap-4 justify-center flex-wrap">
          <div className="w-16 h-16 rounded-full border-2 border-sky-700 flex flex-col items-center justify-center shrink-0 text-sky-700">
            <span className="text-[7px] font-bold leading-none">THE REHOBOTH</span>
            <span className="text-sm font-black leading-none my-0.5">TRCM</span>
            <span className="text-[6px] font-bold leading-none">CLINIC &amp; MATERNITY</span>
          </div>
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-black text-sky-700 uppercase tracking-tight">The Rehoboth Clinic &amp; Maternity</h1>
            <p className="text-[11px] text-sky-700 font-semibold uppercase">P.O. Box 89, Adogbe Living Faith Church</p>
            <p className="text-[11px] text-sky-700 font-semibold uppercase">Odole Mopa Mopamuro L.G.A., Kogi State</p>
            <p className="text-sm font-bold text-sky-700 mt-1">08054894848</p>
          </div>
        </div>
        <div
          className="mt-3 bg-sky-700 text-white text-center font-black tracking-wide py-1 uppercase text-sm"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
          Laboratory Request Form
        </div>

        {/* Request part */}
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_130px_90px] gap-3">
            {field('Patient Name', 'patientName', { wrap: 'col-span-2 sm:col-span-1' })}
            {field('Sex', 'sex', {
              control: readOnly ? undefined : (
                <select
                  value={values.sex}
                  onChange={e => set({ sex: e.target.value })}
                  className={cn('flex-1 min-w-0 bg-transparent px-1 py-1 text-sm outline-none focus:bg-sky-50/50', LINE)}
                >
                  <option value="" /><option>Male</option><option>Female</option>
                </select>
              ),
            })}
            {field('Age', 'age')}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_100px] gap-3">
            {field('Hospital/Clinic', 'hospitalClinic', { wrap: 'col-span-2 sm:col-span-1' })}
            <div>
              {field('Ward', 'ward', { control: picker('ward', wards, 'Search ward…') })}
              {!readOnly && onAddWard && (
                addingWard ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      value={newWard}
                      onChange={e => setNewWard(e.target.value)}
                      placeholder="New ward name"
                      className="flex-1 min-w-0 p-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!newWard.trim()}
                      onClick={async () => {
                        const name = newWard.trim();
                        await onAddWard(name);
                        set({ ward: name });
                        setNewWard('');
                        setAddingWard(false);
                      }}
                      className="px-2 py-1.5 bg-slate-700 text-white rounded-lg text-[10px] font-bold disabled:opacity-40 shrink-0"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingWard(true)}
                    className="mt-1 flex items-center gap-1 text-[10px] font-bold text-sky-700"
                  >
                    <Plus className="w-3 h-3" /> New ward
                  </button>
                )
              )}
            </div>
            {field('No', 'no')}
          </div>

          {field('Clinical History', 'clinicalHistory', { multiline: true, minRows: 2, voice: true })}
          {field('Consultant', 'consultant', { control: picker('consultant', consultants, 'Search consultant…') })}
          {field('Provisional Diagnosis', 'provisionalDiagnosis', { multiline: true, minRows: 2, voice: true })}
          {field('Nature of Specimen', 'natureOfSpecimen', { control: picker('natureOfSpecimen', CULTURE_SPECIMEN_TYPES, 'Search specimen…') })}
          {field('Test Required', 'testRequired', { multiline: true, minRows: 2, voice: true })}
        </div>

        {/* Lab use only */}
        <div className="mt-6 text-center font-black text-slate-800 uppercase tracking-wide text-sm">For Lab Use Only</div>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
            {field('Date of Reception', 'dateOfReception', { type: 'date' })}
            <div className="flex items-end gap-2">
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap pb-1">Lab No:</span>
              <span className={cn('flex-1 min-w-0 px-1 py-1 text-sm min-h-[1.75rem]', LINE, values.labNo ? 'text-slate-900 font-bold' : 'text-slate-400 italic')}>
                {values.labNo || (readOnly ? '' : (labNoPlaceholder || 'Assigned on save'))}
              </span>
            </div>
          </div>
          {field('Lab Result', 'labResult', { multiline: true, minRows: 3, voice: true })}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
            <div>
              {readOnly ? (
                <div className="px-1 py-1 text-sm min-h-[1.75rem] border-b border-dotted border-slate-500">{niceDate(values.resultDate)}</div>
              ) : (
                <input
                  type="date"
                  value={values.resultDate}
                  onChange={e => set({ resultDate: e.target.value })}
                  className="w-full bg-transparent px-1 py-1 text-sm outline-none border-b border-dotted border-slate-500 focus:bg-sky-50/50"
                />
              )}
              <p className="text-xs italic text-slate-600 mt-1">Date</p>
            </div>
            <div className="sm:text-right">
              {readOnly ? (
                <div className="px-1 py-1 text-sm min-h-[1.75rem] border-b border-dotted border-slate-500 sm:text-right">{values.labSecretary}</div>
              ) : (
                <input
                  value={values.labSecretary}
                  onChange={e => set({ labSecretary: e.target.value })}
                  className="w-full bg-transparent px-1 py-1 text-sm outline-none border-b border-dotted border-slate-500 sm:text-right focus:bg-sky-50/50"
                />
              )}
              <p className="text-xs italic text-slate-600 mt-1">Lab. Secretary</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notes: not on the paper original; grows as the lab writes more. */}
      {(!readOnly || values.notes.trim()) && (
        <div className="mt-3 border border-slate-300 rounded-sm p-3 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</span>
            {!readOnly && (
              <VoiceDictationButton onFinalResult={text => set({ notes: (values.notes ? values.notes + ' ' : '') + text })} />
            )}
          </div>
          {readOnly ? (
            <p className="mt-1 text-sm whitespace-pre-wrap break-words text-slate-900">{values.notes}</p>
          ) : (
            <div className="mt-1">
              <AutoTextarea
                value={values.notes}
                onChange={v => set({ notes: v })}
                minRows={3}
                placeholder="Extra detail about this test (optional). The box grows as you type."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
