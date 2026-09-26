import React, { useEffect, useMemo, useState } from 'react';
import { Patient, Admission, DrugChartItem, DrugChartTick } from '../types';
import { format, eachDayOfInterval, parseISO, startOfDay } from 'date-fns';
import { Plus, Pill, Check, Pencil } from 'lucide-react';
import { FullScreenSheet } from './FullScreenSheet';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { toast } from 'sonner';
import { VoiceDictationButton } from './VoiceDictationButton';

interface Props {
  patient: Patient;
  admission: Admission;
  userId: string;
  onClose: () => void;
}

const SHIFTS: DrugChartTick['timeOfDay'][] = ['Night', 'Morning', 'Afternoon'];

const itemFromRow = (r: any): DrugChartItem => ({
  id: r.id, admissionId: r.admission_id, patientId: r.patient_id, drugName: r.drug_name,
  dose: r.dose, route: r.route, frequency: r.frequency, sortOrder: r.sort_order,
  prescribedBy: r.prescribed_by, createdAt: r.created_at,
});

const tickFromRow = (r: any): DrugChartTick => ({
  id: r.id, itemId: r.item_id, entryDate: r.entry_date, timeOfDay: r.time_of_day,
  administeredBy: r.administered_by, administeredAt: r.administered_at,
});

const EMPTY_DRAFT = { drugName: '', dose: '', route: '', frequency: '' };

export const DrugChartSheet: React.FC<Props> = ({ patient, admission, userId, onClose }) => {
  const [items, setItems] = useState<DrugChartItem[]>([]);
  const [ticks, setTicks] = useState<DrugChartTick[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);

  const fetchAll = async () => {
    const { data: itemRows, error: itemErr } = await supabase
      .from('drug_chart_items')
      .select('*')
      .eq('admission_id', admission.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (itemErr) { handleSupabaseError(itemErr, 'select', 'drug_chart_items'); setLoading(false); return; }
    const loadedItems = (itemRows || []).map(itemFromRow);
    setItems(loadedItems);

    if (loadedItems.length === 0) { setTicks([]); setLoading(false); return; }
    const { data: tickRows, error: tickErr } = await supabase
      .from('drug_chart_ticks')
      .select('*')
      .in('item_id', loadedItems.map(i => i.id));
    if (tickErr) { handleSupabaseError(tickErr, 'select', 'drug_chart_ticks'); setLoading(false); return; }
    setTicks((tickRows || []).map(tickFromRow));
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`drug-chart-${admission.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drug_chart_items', filter: `admission_id=eq.${admission.id}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drug_chart_ticks' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission.id]);

  const dateColumns = useMemo(() => {
    const start = startOfDay(parseISO(admission.admittedAt));
    const end = admission.dischargedAt ? startOfDay(parseISO(admission.dischargedAt)) : startOfDay(new Date());
    if (end < start) return [start];
    return eachDayOfInterval({ start, end });
  }, [admission.admittedAt, admission.dischargedAt]);

  const tickMap = useMemo(() => {
    const map = new Map<string, DrugChartTick>();
    for (const t of ticks) map.set(`${t.itemId}__${t.entryDate}__${t.timeOfDay}`, t);
    return map;
  }, [ticks]);

  const handleAddDrug = async () => {
    if (!draft.drugName.trim()) { toast.error('Enter a drug name.'); return; }
    setAdding(true);
    const { error } = await supabase.from('drug_chart_items').insert({
      admission_id: admission.id,
      patient_id: patient.cardId,
      drug_name: draft.drugName.trim(),
      dose: draft.dose.trim() || null,
      route: draft.route.trim() || null,
      frequency: draft.frequency.trim() || null,
      sort_order: items.length,
      prescribed_by: userId,
    });
    setAdding(false);
    if (error) return handleSupabaseError(error, 'insert', 'drug_chart_items');
    toast.success('Drug added to chart.');
    setDraft(EMPTY_DRAFT);
  };

  const startEdit = (item: DrugChartItem) => {
    setEditingId(item.id);
    setEditDraft({ drugName: item.drugName, dose: item.dose || '', route: item.route || '', frequency: item.frequency || '' });
  };

  const saveEdit = async (itemId: string) => {
    if (!editDraft.drugName.trim()) { toast.error('Enter a drug name.'); return; }
    const { error } = await supabase.from('drug_chart_items').update({
      drug_name: editDraft.drugName.trim(),
      dose: editDraft.dose.trim() || null,
      route: editDraft.route.trim() || null,
      frequency: editDraft.frequency.trim() || null,
    }).eq('id', itemId);
    if (error) return handleSupabaseError(error, 'update', 'drug_chart_items');
    toast.success('Drug updated.');
    setEditingId(null);
  };

  const toggleTick = async (item: DrugChartItem, dateStr: string, shift: DrugChartTick['timeOfDay']) => {
    const key = `${item.id}__${dateStr}__${shift}`;
    const existing = tickMap.get(key);
    if (existing) {
      const { error } = await supabase.from('drug_chart_ticks').delete().eq('id', existing.id);
      if (error) return handleSupabaseError(error, 'delete', 'drug_chart_ticks');
      setTicks(prev => prev.filter(t => t.id !== existing.id));
    } else {
      const { data, error } = await supabase.from('drug_chart_ticks').insert({
        item_id: item.id,
        entry_date: dateStr,
        time_of_day: shift,
        administered_by: userId,
      }).select().single();
      if (error) return handleSupabaseError(error, 'insert', 'drug_chart_ticks');
      setTicks(prev => [...prev, tickFromRow(data)]);
    }
  };

  return (
    <FullScreenSheet title="Drug Chart" subtitle={patient.name} onClose={onClose}>
      <div className="max-w-full mx-auto p-4 space-y-6 pb-24">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add Drug to Chart</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex items-center gap-2">
              <input
                value={draft.drugName}
                onChange={e => setDraft({ ...draft, drugName: e.target.value })}
                placeholder="Drug name"
                className="flex-1 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <VoiceDictationButton size="md" onFinalResult={text => setDraft(d => ({ ...d, drugName: text }))} />
            </div>
            <input
              value={draft.dose}
              onChange={e => setDraft({ ...draft, dose: e.target.value })}
              placeholder="Dose (e.g. 500mg)"
              className="p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <input
              value={draft.route}
              onChange={e => setDraft({ ...draft, route: e.target.value })}
              placeholder="Route (e.g. IV, IM, Oral)"
              className="p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <input
              value={draft.frequency}
              onChange={e => setDraft({ ...draft, frequency: e.target.value })}
              placeholder="Frequency (e.g. 8 hourly)"
              className="col-span-2 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <button
            onClick={handleAddDrug}
            disabled={adding}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> {adding ? 'Adding...' : 'Add Drug'}
          </button>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 text-sm py-8">Loading...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Pill className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No drugs on this chart yet. Add one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400">
              Tap a cell to mark a drug as given for that shift. A blank cell means it was not administered.
            </p>
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-slate-700 text-white px-3 py-2 text-left min-w-[180px]">Drug</th>
                    {dateColumns.map(d => (
                      <th key={d.toISOString()} colSpan={3} className="bg-slate-700 text-white px-2 py-2 text-center border-l border-slate-600 whitespace-nowrap">
                        {format(d, 'EEE, MMM d')}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-20 bg-slate-100 px-3 py-1"></th>
                    {dateColumns.map(d => (
                      SHIFTS.map(s => (
                        <th key={`${d.toISOString()}-${s}`} className="bg-slate-100 text-slate-500 font-bold px-2 py-1 text-center border-l border-slate-200 min-w-[36px]">
                          {s[0]}
                        </th>
                      ))
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top min-w-[180px] border-r border-slate-200">
                        {editingId === item.id ? (
                          <div className="space-y-1">
                            <input value={editDraft.drugName} onChange={e => setEditDraft({ ...editDraft, drugName: e.target.value })} className="w-full p-1.5 text-xs border border-slate-200 rounded" placeholder="Drug name" />
                            <input value={editDraft.dose} onChange={e => setEditDraft({ ...editDraft, dose: e.target.value })} className="w-full p-1.5 text-xs border border-slate-200 rounded" placeholder="Dose" />
                            <input value={editDraft.route} onChange={e => setEditDraft({ ...editDraft, route: e.target.value })} className="w-full p-1.5 text-xs border border-slate-200 rounded" placeholder="Route" />
                            <input value={editDraft.frequency} onChange={e => setEditDraft({ ...editDraft, frequency: e.target.value })} className="w-full p-1.5 text-xs border border-slate-200 rounded" placeholder="Frequency" />
                            <div className="flex gap-1 pt-1">
                              <button onClick={() => saveEdit(item.id)} className="flex-1 py-1 bg-blue-600 text-white rounded text-[10px] font-bold">Save</button>
                              <button onClick={() => setEditingId(null)} className="flex-1 py-1 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{item.drugName}</p>
                              <p className="text-[10px] text-slate-400 truncate">
                                {[item.dose, item.route, item.frequency].filter(Boolean).join(' \u00b7 ') || '\u2014'}
                              </p>
                            </div>
                            <button onClick={() => startEdit(item)} className="p-1 text-slate-300 hover:text-blue-600 shrink-0">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      {dateColumns.map(d => {
                        const dateStr = format(d, 'yyyy-MM-dd');
                        return SHIFTS.map(s => {
                          const tick = tickMap.get(`${item.id}__${dateStr}__${s}`);
                          return (
                            <td key={`${item.id}-${dateStr}-${s}`} className="border-l border-slate-100 p-0 text-center">
                              <button
                                onClick={() => toggleTick(item, dateStr, s)}
                                title={tick ? `Given (${s})` : `Mark ${s} as given`}
                                className={`w-9 h-9 flex items-center justify-center transition-colors ${tick ? 'bg-green-100 hover:bg-green-200' : 'hover:bg-slate-50'}`}
                              >
                                {tick ? <Check className="w-4 h-4 text-green-600" /> : null}
                              </button>
                            </td>
                          );
                        });
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </FullScreenSheet>
  );
};
