import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Patient, Admission, DrugChartGrid, DrugChartGridRow, DrugChartGivenMark } from '../types';
import { Check, Plus, Save } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { logAction } from '../lib/audit';
import { ConfirmModal } from './ConfirmModal';
import { FullScreenSheet } from './FullScreenSheet';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { toast } from 'sonner';

interface Props {
  patient: Patient;
  admission: Admission;
  userId: string;
  onClose: () => void;
}

// This is a 1:1 digital replica of the clinic's physical paper Drug
// Chart form: a plain grid (Date column + blank columns, all
// hand-filled by staff). It is intentionally NOT a structured
// drug/dose/frequency tracker — the paper form carries no such
// structure, so neither does this. Column headers and cells are
// blank by default, exactly as printed, and fully editable.
const DEFAULT_COLUMN_COUNT = 7; // blank columns after the fixed "Date:" column
const DEFAULT_ROW_COUNT = 8; // blank rows, matching the printed form

const gridFromRow = (r: any): DrugChartGrid => ({
  id: r.id,
  admissionId: r.admission_id,
  patientId: r.patient_id,
  headerRow: r.header_row || [],
  rows: r.rows || [],
  createdBy: r.created_by,
  updatedAt: r.updated_at,
  createdAt: r.created_at,
});

const blankRow = (columnCount: number): DrugChartGridRow => ({
  date: '',
  cells: Array(columnCount).fill(''),
  given: Array(columnCount).fill(null),
});

const givenAt = (row: DrugChartGridRow, col: number): DrugChartGivenMark | null => row.given?.[col] ?? null;

// A text box that grows with what is typed, so a long drug name or dose is
// always fully visible and wraps inside its cell instead of being cut off.
const GrowText: React.FC<{
  value: string; onChange: (v: string) => void; className?: string; readOnly?: boolean; ariaLabel?: string;
}> = ({ value, onChange, className, readOnly, ariaLabel }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      readOnly={readOnly}
      aria-label={ariaLabel}
      onChange={e => onChange(e.target.value)}
      className={`${className || ''} resize-none overflow-hidden block break-words whitespace-pre-wrap`}
    />
  );
};

export const DrugChartSheet: React.FC<Props> = ({ patient, admission, userId, onClose }) => {
  const { user } = useAuth();
  const [untickTarget, setUntickTarget] = useState<{ row: number; col: number } | null>(null);
  const [ticking, setTicking] = useState(false);
  const [grid, setGrid] = useState<DrugChartGrid | null>(null);
  const [headerRow, setHeaderRow] = useState<string[]>(Array(DEFAULT_COLUMN_COUNT).fill(''));
  const [rows, setRows] = useState<DrugChartGridRow[]>(
    Array.from({ length: DEFAULT_ROW_COUNT }, () => blankRow(DEFAULT_COLUMN_COUNT))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchGrid = async () => {
    const { data, error } = await supabase
      .from('drug_chart_grids')
      .select('*')
      .eq('admission_id', admission.id)
      .maybeSingle();
    if (error) { handleSupabaseError(error, 'select', 'drug_chart_grids'); setLoading(false); return; }
    if (data) {
      const g = gridFromRow(data);
      setGrid(g);
      setHeaderRow(g.headerRow.length ? g.headerRow : Array(DEFAULT_COLUMN_COUNT).fill(''));
      setRows(g.rows.length ? g.rows : Array.from({ length: DEFAULT_ROW_COUNT }, () => blankRow(g.headerRow.length || DEFAULT_COLUMN_COUNT)));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGrid();
    const channel = supabase
      .channel(`drug-chart-grid-${admission.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drug_chart_grids', filter: `admission_id=eq.${admission.id}` }, () => {
        // Avoid clobbering unsaved local edits from a remote update.
        if (!dirty) fetchGrid();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  const updateHeaderCell = (colIndex: number, value: string) => {
    setHeaderRow(prev => prev.map((c, i) => (i === colIndex ? value : c)));
    setDirty(true);
  };

  const updateDateCell = (rowIndex: number, value: string) => {
    setRows(prev => prev.map((r, i) => (i === rowIndex ? { ...r, date: value } : r)));
    setDirty(true);
  };

  const updateDataCell = (rowIndex: number, colIndex: number, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== rowIndex) return r;
      const cells = [...r.cells];
      cells[colIndex] = value;
      return { ...r, cells };
    }));
    setDirty(true);
  };

  const addColumn = () => {
    setHeaderRow(prev => [...prev, '']);
    setRows(prev => prev.map(r => ({ ...r, cells: [...r.cells, ''], given: [...(r.given ?? Array(r.cells.length).fill(null)), null] })));
    setDirty(true);
  };

  const addRow = () => {
    setRows(prev => [...prev, blankRow(headerRow.length)]);
    setDirty(true);
  };

  const persist = async (nextHeader: string[], nextRows: DrugChartGridRow[]) => {
    const { data, error } = await supabase
      .from('drug_chart_grids')
      .upsert({
        admission_id: admission.id,
        patient_id: patient.cardId,
        header_row: nextHeader,
        rows: nextRows,
        created_by: grid?.createdBy || userId,
      }, { onConflict: 'admission_id' })
      .select()
      .single();
    if (error) { handleSupabaseError(error, 'upsert', 'drug_chart_grids'); return null; }
    return gridFromRow(data);
  };

  // Ticking saves straight away: the chart is filled in once for the whole admission
  // and each shift's nurse ticks off what was given, so a tick must not wait for Save.
  const toggleGiven = async (rowIndex: number, colIndex: number) => {
    if (ticking) return;
    setTicking(true);
    try {
      let baseHeader = headerRow;
      let baseRows = rows;
      if (!dirty) {
        // Start from the latest saved chart so another nurse's ticks are not overwritten.
        const { data, error } = await supabase.from('drug_chart_grids').select('*').eq('admission_id', admission.id).maybeSingle();
        if (error) { handleSupabaseError(error, 'select', 'drug_chart_grids'); return; }
        if (data) { const g = gridFromRow(data); baseHeader = g.headerRow; baseRows = g.rows; }
      }
      const target = baseRows[rowIndex];
      if (!target || !(target.cells[colIndex] || '').trim()) { toast.error('Nothing written in that cell yet.'); return; }
      const wasGiven = !!givenAt(target, colIndex);
      const mark: DrugChartGivenMark | null = wasGiven
        ? null
        : { by: userId, byName: user?.name || 'Staff', at: new Date().toISOString() };
      const nextRows = baseRows.map((r, i) => {
        if (i !== rowIndex) return r;
        const given = [...(r.given ?? Array(r.cells.length).fill(null))];
        given[colIndex] = mark;
        return { ...r, given };
      });
      const saved = await persist(baseHeader, nextRows);
      if (!saved) return;
      setGrid(saved);
      setHeaderRow(saved.headerRow);
      setRows(saved.rows);
      setDirty(false);
      const label = (target.cells[colIndex] || '').trim().slice(0, 60);
      await logAction(userId, mark ? 'DRUG_CHART_GIVEN' : 'DRUG_CHART_UNGIVEN',
        `${mark ? 'Marked given' : 'Cleared given mark on'} "${label}" for patient ${patient.cardId}`);
      toast.success(mark ? 'Marked as given.' : 'Given mark cleared.');
    } finally {
      setTicking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      admission_id: admission.id,
      patient_id: patient.cardId,
      header_row: headerRow,
      rows,
      created_by: grid?.createdBy || userId,
    };
    const { data, error } = await supabase
      .from('drug_chart_grids')
      .upsert(payload, { onConflict: 'admission_id' })
      .select()
      .single();
    setSaving(false);
    if (error) return handleSupabaseError(error, 'upsert', 'drug_chart_grids');
    setGrid(gridFromRow(data));
    setDirty(false);
    toast.success('Drug chart saved.');
  };

  const cellClass = "w-full px-2 py-2 text-xs text-center outline-none focus:bg-blue-50 bg-transparent";

  return (
    <FullScreenSheet
      title="Drug Chart"
      subtitle={patient.name}
      onClose={onClose}
      headerActions={
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 disabled:opacity-40"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      }
    >
      {loading ? (
        <p className="text-center text-slate-400 text-sm py-8">Loading...</p>
      ) : (
        <div className="max-w-[900px] mx-auto p-4 pb-24">
          {/* Letterhead - replica of the printed paper form */}
          <div className="border-2 border-sky-700 rounded-sm p-4 mb-0">
            <div className="flex items-center gap-4 justify-center flex-wrap">
              {/* Circular clinic badge - a clean digital approximation of the
                  printed seal; swap in an image of the actual logo for exact
                  pixel fidelity if you have one on file. */}
              <div className="w-16 h-16 rounded-full border-2 border-sky-700 flex flex-col items-center justify-center shrink-0 text-sky-700">
                <span className="text-[7px] font-bold leading-none">THE REHOBOTH</span>
                <span className="text-sm font-black leading-none my-0.5">TRCM</span>
                <span className="text-[6px] font-bold leading-none">CLINIC & MATERNITY</span>
              </div>
              <div className="text-center">
                <h1 className="text-xl sm:text-2xl font-black text-sky-700 uppercase tracking-tight">
                  The Rehoboth Clinic &amp; Maternity
                </h1>
                <p className="text-[11px] text-sky-700 font-semibold">
                  P.O.Box 89, Adogbe Along Living Faith Church Odole Mopa Mopamuro L.G.A. Kogi State
                </p>
                <p className="text-sm font-bold text-sky-700 mt-1">08054894848</p>
              </div>
            </div>
            <h2 className="text-center text-lg font-black text-sky-700 uppercase mt-2">Drug Chart</h2>
            <div className="flex items-baseline gap-2 mt-3 text-sm">
              <span className="font-semibold text-slate-800">Name:</span>
              <span className="flex-1 border-b border-slate-400 pb-0.5 font-medium text-slate-900">{patient.name}</span>
            </div>
          </div>

          {/* Grid - exact replica of the printed table */}
          <div className="border-2 border-t-0 border-sky-700 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-sky-700">
                  <th className="border-r border-slate-300 px-2 py-2 text-left text-xs font-bold text-slate-800 bg-slate-50 min-w-[90px]">
                    Date:
                  </th>
                  {headerRow.map((val, colIndex) => (
                    <th key={colIndex} className="p-0 min-w-[96px] align-top border-l border-slate-300 first:border-l-0">
                      <GrowText
                        value={val}
                        onChange={v => updateHeaderCell(colIndex, v)}
                        ariaLabel={`Column ${colIndex + 1} heading`}
                        className={cellClass + " font-bold"}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-300">
                    <td className="p-0 align-top border-r border-slate-300 min-w-[90px]">
                      <GrowText
                        value={row.date}
                        onChange={v => updateDateCell(rowIndex, v)}
                        ariaLabel={`Row ${rowIndex + 1} date`}
                        className="w-full px-2 py-2 text-xs outline-none focus:bg-blue-50 bg-transparent"
                      />
                    </td>
                    {row.cells.map((val, colIndex) => {
                      const mark = givenAt(row, colIndex);
                      return (
                        <td
                          key={colIndex}
                          className={`p-0 align-top min-w-[96px] border-l border-slate-300 first:border-l-0 ${mark ? 'bg-emerald-50' : ''}`}
                        >
                          <GrowText
                            value={val}
                            readOnly={!!mark}
                            onChange={v => updateDataCell(rowIndex, colIndex, v)}
                            ariaLabel={`Row ${rowIndex + 1}, column ${colIndex + 1}`}
                            className={cellClass}
                          />
                          {val.trim() && (
                            <div className="px-1 pb-1.5 flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                disabled={ticking}
                                onClick={() => (mark ? setUntickTarget({ row: rowIndex, col: colIndex }) : toggleGiven(rowIndex, colIndex))}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors disabled:opacity-50 ${
                                  mark
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-500 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                                }`}
                              >
                                <Check className="w-3 h-3" /> {mark ? 'Given' : 'Mark given'}
                              </button>
                              {mark && (
                                <span className="text-[9px] leading-tight text-emerald-800 text-center">
                                  {mark.byName} · {format(new Date(mark.at), 'd MMM, HH:mm')}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Digital-only conveniences - not on the paper form, needed
              since a screen can't add another printed sheet */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={addRow}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200"
            >
              <Plus className="w-3 h-3" /> Add Row
            </button>
            <button
              onClick={addColumn}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200"
            >
              <Plus className="w-3 h-3" /> Add Column
            </button>
          </div>
          {dirty && (
            <p className="text-center text-[11px] text-amber-600 font-semibold mt-2">
              Unsaved changes — tap Save above.
            </p>
          )}
          <p className="text-center text-[11px] text-slate-400 mt-2">
            Tap "Mark given" when a dose has been given. It saves at once with your name and the time. A given entry is locked; clear its mark to edit it.
          </p>
        </div>
      )}
      <ConfirmModal
        isOpen={!!untickTarget}
        title="Clear given mark?"
        message="This removes the record of who gave this and when, and unlocks the entry for editing."
        confirmText="Clear mark"
        onConfirm={() => {
          const t = untickTarget;
          setUntickTarget(null);
          if (t) toggleGiven(t.row, t.col);
        }}
        onCancel={() => setUntickTarget(null)}
      />
    </FullScreenSheet>
  );
};
