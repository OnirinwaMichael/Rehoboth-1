import React, { useEffect, useState } from 'react';
import { Patient, Admission, VitalSignsGrid } from '../types';
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

// 1:1 digital replica of the clinic's physical paper Vital Signs
// form: Date-group columns (each split into Night/Morning/Afternoon)
// across the top, and fixed T / P / R / BP rows down the side,
// printed twice. The row labels are fixed (printed), exactly like
// "Date:" and "Name:" on the paper - only the actual cells and the
// per-date-group headers are blank/editable.
const SUB_COLS = ['N', 'M', 'A'];
const ROW_LABELS = ['T', 'P', 'R', 'BP', 'T', 'P', 'R', 'BP'];
const DEFAULT_GROUP_COUNT = 7; // date-groups, matching the printed form

const gridFromRow = (r: any): VitalSignsGrid => ({
  id: r.id,
  admissionId: r.admission_id,
  patientId: r.patient_id,
  dateHeaders: r.date_headers || [],
  values: r.values || [],
  createdBy: r.created_by,
  updatedAt: r.updated_at,
  createdAt: r.created_at,
});

const blankValues = (groupCount: number): string[][] =>
  ROW_LABELS.map(() => Array(groupCount * 3).fill(''));

export const VitalSignsSheet: React.FC<Props> = ({ patient, admission, userId, onClose }) => {
  const [grid, setGrid] = useState<VitalSignsGrid | null>(null);
  const [dateHeaders, setDateHeaders] = useState<string[]>(Array(DEFAULT_GROUP_COUNT).fill(''));
  const [values, setValues] = useState<string[][]>(blankValues(DEFAULT_GROUP_COUNT));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchGrid = async () => {
    const { data, error } = await supabase
      .from('vital_signs_grids')
      .select('*')
      .eq('admission_id', admission.id)
      .maybeSingle();
    if (error) { handleSupabaseError(error, 'select', 'vital_signs_grids'); setLoading(false); return; }
    if (data) {
      const g = gridFromRow(data);
      const groupCount = g.dateHeaders.length || DEFAULT_GROUP_COUNT;
      setGrid(g);
      setDateHeaders(g.dateHeaders.length ? g.dateHeaders : Array(DEFAULT_GROUP_COUNT).fill(''));
      setValues(g.values.length === ROW_LABELS.length ? g.values : blankValues(groupCount));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGrid();
    const channel = supabase
      .channel(`vital-signs-grid-${admission.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vital_signs_grids', filter: `admission_id=eq.${admission.id}` }, () => {
        if (!dirty) fetchGrid();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  const updateDateHeader = (groupIndex: number, value: string) => {
    setDateHeaders(prev => prev.map((d, i) => (i === groupIndex ? value : d)));
    setDirty(true);
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    setValues(prev => prev.map((row, r) => {
      if (r !== rowIndex) return row;
      const next = [...row];
      next[colIndex] = value;
      return next;
    }));
    setDirty(true);
  };

  const addDateGroup = () => {
    setDateHeaders(prev => [...prev, '']);
    setValues(prev => prev.map(row => [...row, '', '', '']));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      admission_id: admission.id,
      patient_id: patient.cardId,
      date_headers: dateHeaders,
      values,
      created_by: grid?.createdBy || userId,
    };
    const { data, error } = await supabase
      .from('vital_signs_grids')
      .upsert(payload, { onConflict: 'admission_id' })
      .select()
      .single();
    setSaving(false);
    if (error) return handleSupabaseError(error, 'upsert', 'vital_signs_grids');
    setGrid(gridFromRow(data));
    setDirty(false);
    toast.success('Vital signs chart saved.');
  };

  const cellClass = "w-full h-full px-1 py-2 text-xs text-center outline-none focus:bg-blue-50 border-l border-slate-300 bg-transparent";

  return (
    <FullScreenSheet
      title="Vital Signs"
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
            <h2 className="text-center text-lg font-black text-sky-700 uppercase mt-2">Vital Signs</h2>
            <div className="flex items-baseline gap-2 mt-3 text-sm">
              <span className="font-semibold text-slate-800">Name:</span>
              <span className="flex-1 border-b border-slate-400 pb-0.5 font-medium text-slate-900">{patient.name}</span>
            </div>
          </div>

          {/* Grid - exact replica of the printed table */}
          <div className="border-2 border-t-0 border-sky-700 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="border-r border-slate-300 px-2 py-2 text-left text-xs font-bold text-slate-800 bg-slate-50 min-w-[60px]">
                    Date:
                  </th>
                  {dateHeaders.map((val, groupIndex) => (
                    <th key={groupIndex} colSpan={3} className="p-0 min-w-[90px] border-l border-slate-300">
                      <input
                        value={val}
                        onChange={e => updateDateHeader(groupIndex, e.target.value)}
                        className="w-full px-1 py-2 text-xs text-center font-bold outline-none focus:bg-blue-50 bg-transparent"
                      />
                    </th>
                  ))}
                </tr>
                <tr className="border-b-2 border-sky-700">
                  <th className="border-r border-slate-300 bg-slate-50"></th>
                  {dateHeaders.map((_, groupIndex) => (
                    SUB_COLS.map((s, si) => (
                      <th key={`${groupIndex}-${s}`} className="border-l border-slate-300 first:border-l-0 px-1 py-1 text-[10px] font-bold text-slate-500 min-w-[24px]">
                        {s}
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROW_LABELS.map((label, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={rowIndex === 3 || rowIndex === 7 ? "border-b-2 border-sky-700" : "border-b border-slate-200"}
                    style={rowIndex === 4 ? { borderTop: '10px solid white' } : undefined}
                  >
                    <td className="border-r border-slate-300 px-2 py-2 text-xs font-bold text-slate-800 bg-slate-50">
                      {label}
                    </td>
                    {values[rowIndex]?.map((val, colIndex) => (
                      <td key={colIndex} className="p-0 border-l border-slate-300 first:border-l-0">
                        <input
                          value={val}
                          onChange={e => updateCell(rowIndex, colIndex, e.target.value)}
                          className={cellClass}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Digital-only convenience - not on the paper form, needed
              since a screen can't add another printed sheet */}
          <button
            onClick={addDateGroup}
            className="w-full flex items-center justify-center gap-1 py-2 mt-3 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200"
          >
            <Plus className="w-3 h-3" /> Add Date Column
          </button>
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
