import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, CheckCircle, ChevronDown, ChevronRight, Clock, CreditCard, History, Printer, Save, X } from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { logAction } from '../lib/audit';
import { cn } from '../lib/utils';
import { LabTest, Patient } from '../types';
import { FullScreenSheet } from './FullScreenSheet';
import { LabReportEditor } from './LabReportEditor';
import { LabRequestFormPaper } from './LabRequestFormPaper';
import { buildPaperValues, PaperValues, toRequestDetails } from '../lib/labRequestForm';
import { ComprehensivePanelResults, emptyPanelResults } from '../data/labReportTemplates';

export type LabTestX = LabTest & { patient?: Patient };

// An unpaid test can't be filled in. Free tests (no price) never go through
// billing, so they are not held back; neither is a test that already has a
// result (e.g. a walk-in the lab recorded on the spot).
export const isLabTestLocked = (t: LabTest) =>
  !t.result && t.paymentStatus !== 'paid' && (Number(t.price) || 0) > 0;

interface Draft {
  reportType: 'basic' | 'comprehensive';
  paper: PaperValues;
  panelResults: ComprehensivePanelResults;
  notes: string; // comprehensive: free notes saved in `result`
  imageUrl: string;
}

const initDraft = (t: LabTestX): Draft => {
  const comp = t.reportType === 'comprehensive';
  return {
    reportType: comp ? 'comprehensive' : 'basic',
    paper: buildPaperValues(t),
    panelResults: t.panelResults && Object.keys(t.panelResults).length > 0 ? t.panelResults : emptyPanelResults(),
    notes: comp && t.result && t.result !== 'See structured report' ? t.result : '',
    imageUrl: t.imageUrl || '',
  };
};

const draftKey = (id: string) => `draft_lab_entry_${id}`;

const loadStored = (t: LabTestX): Draft | null => {
  try {
    const raw = localStorage.getItem(draftKey(t.id));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || !p.paper) return null;
    const base = initDraft(t);
    return { ...base, ...p, paper: { ...base.paper, ...p.paper } };
  } catch { return null; }
};

const ImageAttach: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600 flex items-center gap-2"><Camera className="w-4 h-4" /> Attach image (optional)</span>
        <button type="button" onClick={() => setShow(s => !s)} className="text-xs font-bold text-blue-600">
          {show ? 'Cancel' : 'Add image'}
        </button>
      </div>
      {show && (
        <label className="flex items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 text-sm font-bold text-slate-500">
          Tap to choose an image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1000000) { toast.error('Image too large (max 1MB)'); return; }
              const reader = new FileReader();
              reader.onloadend = () => { onChange(reader.result as string); setShow(false); };
              reader.readAsDataURL(file);
            }}
          />
        </label>
      )}
      {value && (
        <div className="relative w-full h-40 rounded-xl overflow-hidden border border-slate-200">
          <img src={value} alt="Attachment" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange('')} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

interface Props {
  tests: LabTestX[];
  userId: string;
  wards: string[];
  consultants: string[];
  onAddWard: (name: string) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
  onShowHistory: (patientId: string) => void;
  onPrint: (tests: LabTestX[]) => void;
}

export const LabGroupEntryPanel: React.FC<Props> = ({
  tests, userId, wards, consultants, onAddWard, onClose, onSaved, onShowHistory, onPrint,
}) => {
  const first = tests[0];
  const patientName = first?.familyMemberName || first?.patient?.name || first?.patientId || '';

  // Build the starting drafts once: saved values, or an unsaved draft kept on this device.
  const startRef = useRef<{ drafts: Record<string, Draft>; restored: string[] } | null>(null);
  if (!startRef.current) {
    const out: Record<string, Draft> = {};
    const rest: string[] = [];
    tests.forEach(t => {
      if (isLabTestLocked(t)) { out[t.id] = initDraft(t); return; }
      const stored = loadStored(t);
      if (stored) { out[t.id] = stored; rest.push(t.id); } else out[t.id] = initDraft(t);
    });
    startRef.current = { drafts: out, restored: rest };
  }
  const [restored, setRestored] = useState<string[]>(startRef.current.restored);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(startRef.current.drafts);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const target = tests.find(t => !isLabTestLocked(t) && !t.result) || tests.find(t => !isLabTestLocked(t));
    return target ? { [target.id]: true } : {};
  });
  const [saving, setSaving] = useState(false);

  const draftOf = (t: LabTestX): Draft => drafts[t.id] ?? initDraft(t);
  const isDirty = (t: LabTestX) => JSON.stringify(draftOf(t)) !== JSON.stringify(initDraft(t));

  const patch = (t: LabTestX, p: Partial<Draft>) =>
    setDrafts(prev => ({ ...prev, [t.id]: { ...(prev[t.id] ?? initDraft(t)), ...p } }));
  const patchPaper = (t: LabTestX, p: Partial<PaperValues>) =>
    setDrafts(prev => {
      const cur = prev[t.id] ?? initDraft(t);
      return { ...prev, [t.id]: { ...cur, paper: { ...cur.paper, ...p } } };
    });
  const patchPanel = (t: LabTestX, fn: (pr: ComprehensivePanelResults) => ComprehensivePanelResults) =>
    setDrafts(prev => {
      const cur = prev[t.id] ?? initDraft(t);
      return { ...prev, [t.id]: { ...cur, panelResults: fn(cur.panelResults) } };
    });

  // Keep unsaved entries on this device so a refresh or dropped signal does not lose them.
  const testsRef = useRef(tests);
  testsRef.current = tests;
  useEffect(() => {
    const timer = setTimeout(() => {
      testsRef.current.forEach(t => {
        if (isLabTestLocked(t)) return;
        const d = drafts[t.id];
        try {
          if (d && JSON.stringify(d) !== JSON.stringify(initDraft(t))) localStorage.setItem(draftKey(t.id), JSON.stringify(d));
          else localStorage.removeItem(draftKey(t.id));
        } catch { /* storage full or blocked: drafts are best-effort */ }
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [drafts]);

  const anyDirty = tests.some(t => !isLabTestLocked(t) && isDirty(t));

  const handleClose = () => {
    if (anyDirty && !window.confirm('You have unsaved entries. Close anyway? They stay as a draft on this device.')) return;
    onClose();
  };

  const discardRestored = () => {
    setDrafts(prev => {
      const next = { ...prev };
      tests.filter(t => restored.includes(t.id)).forEach(t => {
        next[t.id] = initDraft(t);
        try { localStorage.removeItem(draftKey(t.id)); } catch { /* ignore */ }
      });
      return next;
    });
    setRestored([]);
  };

  const nextLabNo = async (): Promise<string> => {
    const { data, error } = await supabase.rpc('next_lab_no');
    if (error || !data || typeof data !== 'string') {
      console.error('[next_lab_no]', error?.message);
      return '';
    }
    return data;
  };

  const handleSaveAll = async () => {
    const targets = tests.filter(t => !isLabTestLocked(t) && isDirty(t));
    if (targets.length === 0) { toast.message('Nothing to save: no changes were made.'); return; }
    for (const t of targets) {
      const d = draftOf(t);
      if (d.reportType === 'basic' && !d.paper.labResult.trim()) {
        setOpen(o => ({ ...o, [t.id]: true }));
        toast.error(`Lab Result is empty for ${t.testType}.`);
        return;
      }
    }
    setSaving(true);
    // One Lab No per patient request: reuse a sibling's, otherwise draw the next one.
    let labNo = '';
    if (targets.some(t => draftOf(t).reportType === 'basic')) {
      labNo = tests.map(t => draftOf(t).paper.labNo || t.requestDetails?.labNo || '').find(Boolean) || '';
      if (!labNo) {
        labNo = await nextLabNo();
        if (!labNo) {
          setSaving(false);
          toast.error('Could not generate a Lab No. Check your connection and try again.');
          return;
        }
      }
    }
    const failed: string[] = [];
    let saved = 0;
    for (const t of targets) {
      const d = draftOf(t);
      const common = { report_type: d.reportType, image_url: d.imageUrl || null, updated_at: new Date().toISOString() };
      const update = d.reportType === 'basic'
        ? {
            ...common,
            result: d.paper.labResult.trim(),
            request_details: toRequestDetails({ ...d.paper, labNo: d.paper.labNo || labNo }),
          }
        : {
            ...common,
            result: d.notes.trim() || 'See structured report',
            panel_results: d.panelResults,
          };
      const { error } = await supabase.from('lab_tests').update(update).eq('id', t.id);
      if (error) {
        console.error('[lab_tests:update]', error.message);
        handleSupabaseError(error, 'update', 'lab_tests');
        failed.push(t.testType);
        continue;
      }
      saved += 1;
      await logAction(userId, 'SAVE_LAB_RESULT', `Saved lab results for patient ${t.patientId}, test: ${t.testType}`);
      try { localStorage.removeItem(draftKey(t.id)); } catch { /* ignore */ }
    }
    setSaving(false);
    if (saved > 0) onSaved();
    if (failed.length > 0) {
      toast.error(`Could not save: ${failed.join(', ')}. The rest were saved.`);
      return;
    }
    toast.success(saved === 1 ? 'Lab result saved.' : `${saved} lab results saved.`);
    onClose();
  };

  const completedCount = tests.filter(t => !!t.result).length;
  const allOpen = tests.every(t => open[t.id] || isLabTestLocked(t));

  return (
    <FullScreenSheet
      title="Lab Results"
      subtitle={`${patientName} · ${tests.length} test${tests.length === 1 ? '' : 's'} · ${completedCount} completed`}
      onClose={handleClose}
      headerActions={
        <>
          <button
            onClick={() => onShowHistory(first.patientId)}
            className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600"
            title="View patient history"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPrint(tests)}
            className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600"
            title="Print saved forms"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save all'}
          </button>
        </>
      }
    >
      <div className="max-w-[900px] mx-auto p-4 pb-24 space-y-3">
        {restored.length > 0 && (
          <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            <span>Unsaved entries from earlier were restored on this device.</span>
            <button onClick={discardRestored} className="font-bold underline shrink-0">Discard</button>
          </div>
        )}

        {tests.length > 1 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                const next: Record<string, boolean> = {};
                tests.forEach(t => { next[t.id] = !allOpen; });
                setOpen(next);
              }}
              className="text-xs font-bold text-blue-600"
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        )}

        {tests.map(t => {
          const d = draftOf(t);
          const locked = isLabTestLocked(t);
          const isOpen = !!open[t.id] && !locked;
          const dirty = !locked && isDirty(t);
          return (
            <div key={t.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              <button
                type="button"
                disabled={locked}
                onClick={() => setOpen(o => ({ ...o, [t.id]: !o[t.id] }))}
                className="w-full flex items-center gap-3 px-4 py-3 text-left bg-slate-50 disabled:cursor-not-allowed"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                <span className="font-bold text-slate-900 flex-1 min-w-0 truncate">{t.testType}</span>
                {dirty && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Unsaved changes" />}
                {locked ? (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase bg-orange-100 text-orange-600 shrink-0">Awaiting payment</span>
                ) : t.result ? (
                  <span className="flex items-center gap-1 text-green-600 text-xs font-bold shrink-0"><CheckCircle className="w-3 h-3" /> Completed</span>
                ) : (
                  <span className="flex items-center gap-1 text-orange-500 text-xs font-bold shrink-0"><Clock className="w-3 h-3" /> Pending</span>
                )}
              </button>

              {locked && (
                <div className="flex items-start gap-3 p-4 bg-orange-50 border-t border-orange-100 text-xs">
                  <CreditCard className="w-5 h-5 text-orange-500 shrink-0" />
                  <p className="text-orange-700">
                    <span className="font-bold uppercase">Unpaid.</span> This test can't be filled in until Accounts records the payment.
                  </p>
                </div>
              )}

              {isOpen && (
                <div className="p-4 space-y-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600 whitespace-nowrap">Form</label>
                    <select
                      value={d.reportType}
                      onChange={e => patch(t, { reportType: e.target.value as Draft['reportType'] })}
                      className="flex-1 p-2 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="basic">Basic Lab Request Form</option>
                      <option value="comprehensive">Comprehensive Lab Report</option>
                    </select>
                  </div>

                  {t.reportType === 'legacy' && t.result && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      This result was recorded in the old free-form layout. It is shown in Lab Result below; saving moves it onto the new form.
                    </p>
                  )}

                  {d.reportType === 'basic' ? (
                    <LabRequestFormPaper
                      values={d.paper}
                      onChange={p => patchPaper(t, p)}
                      wards={wards}
                      consultants={consultants}
                      onAddWard={onAddWard}
                    />
                  ) : (
                    <LabReportEditor
                      test={t}
                      panelResults={d.panelResults}
                      onUpdatePanelField={(section, key, value) =>
                        patchPanel(t, pr => ({ ...pr, [section]: { ...((pr[section] as any) || {}), [key]: value } }))}
                      onUpdateSensitivity={(antibiotic, field, value) =>
                        patchPanel(t, pr => ({
                          ...pr,
                          sensitivity: {
                            ...(pr.sensitivity || {}),
                            [antibiotic]: { ...(pr.sensitivity?.[antibiotic] || { rate: '', result: '' }), [field]: value },
                          },
                        }))}
                      onUpdateCultureCell={(specimen, finding, value) =>
                        patchPanel(t, pr => ({
                          ...pr,
                          cultureMicroscopy: {
                            ...(pr.cultureMicroscopy || {}),
                            [specimen]: { ...(pr.cultureMicroscopy?.[specimen] || {}), [finding]: value },
                          },
                        }))}
                      notes={d.notes}
                      onNotesChange={v => patch(t, { notes: v })}
                    />
                  )}

                  <ImageAttach value={d.imageUrl} onChange={v => patch(t, { imageUrl: v })} />
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={handleSaveAll}
          disabled={saving}
          className={cn(
            'w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50'
          )}
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>
    </FullScreenSheet>
  );
};
