import React, { useEffect, useState } from 'react';
import { Patient, Admission, DrugChartGrid, DrugChartGridRow } from '../types';
import { Plus, Save } from 'lucide-react';
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
});

export const DrugChartSheet: React.FC<Props> = ({ patient, admission, userId, onClose }) => {
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
    setRows(prev => prev.map(r => ({ ...r, cells: [...r.cells, ''] })));
    setDirty(true);
  };

  const addRow = () => {
    setRows(prev => [...prev, blankRow(headerRow.length)]);
    setDirty(true);
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

  const cellClass = "w-full h-full px-2 py-2 text-xs text-center outline-none focus:bg-blue-50 border-l border-slate-300 first:border-l-0 bg-transparent";

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
                    <th key={colIndex} className="p-0 min-w-[70px] border-l border-slate-300 first:border-l-0">
                      <input
                        value={val}
                        onChange={e => updateHeaderCell(colIndex, e.target.value)}
                        className={cellClass + " font-bold border-l-0"}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-300">
                    <td className="p-0 border-r border-slate-300 min-w-[90px]">
                      <input
                        value={row.date}
                        onChange={e => updateDateCell(rowIndex, e.target.value)}
                        className="w-full h-full px-2 py-2 text-xs outline-none focus:bg-blue-50 bg-transparent"
                      />
                    </td>
                    {row.cells.map((val, colIndex) => (
                      <td key={colIndex} className="p-0 min-w-[70px] border-l border-slate-300 first:border-l-0">
                        <input
                          value={val}
                          onChange={e => updateDataCell(rowIndex, colIndex, e.target.value)}
                          className={cellClass}
                        />
                      </td>
                    ))}
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
        </div>
      )}
    </FullScreenSheet>
  );
};
