import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { Clock, Calendar as CalendarIcon, Settings2, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
export const SystemClock: React.FC = () => {
const [now, setNow] = useState(new Date());
const [isManual, setIsManual] = useState(false);
const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
const [manualTime, setManualTime] = useState(format(new Date(), 'HH:mm'));
const [showManualForm, setShowManualForm] = useState(false);
const [calendarMonth, setCalendarMonth] = useState(new Date());
useEffect(() => {
if (!isManual) {
// Use requestAnimationFrame for smoother updates if needed, 
// but for a clock, setInterval(1000) is more efficient for battery/CPU.
const interval = setInterval(() => {
const d = new Date();
// Only update state if the second has changed to avoid unnecessary renders
setNow(prev => {
if (prev.getSeconds() === d.getSeconds()) return prev;
return d;
});
}, 500); // Check more frequently to be precise but only update on second change
return () => clearInterval(interval);
}
}, [isManual]);
const displayedTime = isManual 
? new Date(`${manualDate}T${manualTime}`)
: now;
// Calendar logic (Sunday as first day)
const monthStart = startOfMonth(calendarMonth);
const monthEnd = endOfMonth(monthStart);
const startDate = startOfWeek(monthStart);
const endDate = endOfWeek(monthEnd);
const calendarDays = eachDayOfInterval({
start: startDate,
end: endDate,
});
return (
<div className="relative flex items-center gap-2 sm:gap-4">
<div className="flex items-center gap-2 sm:gap-4 bg-slate-50 p-1.5 sm:p-2 px-3 sm:px-4 rounded-xl border border-slate-200 shadow-sm">
<div className="flex items-center gap-2 text-slate-600">
<CalendarIcon className="w-3.5 h-3.5 sm:w-4 h-4 text-blue-500" />
<div className="flex flex-col leading-tight">
<span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
{format(displayedTime, 'EEE')}
</span>
<span className="text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">
{format(displayedTime, 'MMM d')}
</span>
</div>
</div>
<div className="w-px h-6 sm:h-8 bg-slate-200" />
<div className="flex items-center gap-2 text-slate-600">
<Clock className="w-3.5 h-3.5 sm:w-4 h-4 text-blue-500" />
<span className="text-xs sm:text-sm font-mono font-bold text-slate-900 whitespace-nowrap">
{format(displayedTime, 'HH:mm:ss')}
</span>
</div>
<button 
onClick={() => setShowManualForm(!showManualForm)}
className={cn(
"p-1.5 sm:p-2 rounded-lg transition-all",
showManualForm ? "bg-blue-100 text-blue-600" : "hover:bg-slate-200 text-slate-400"
)}
title="Set Date/Time Manually"
>
<Settings2 className="w-3.5 h-3.5 sm:w-4 h-4" />
</button>
</div>
{showManualForm && (
<div className="absolute top-16 right-0 bg-white p-6 rounded-2xl shadow-2xl border border-slate-200 z-50 w-80 space-y-6 animate-in fade-in slide-in-from-top-4 duration-200">
<div className="flex items-center justify-between">
<h4 className="font-bold text-slate-900">System Time Settings</h4>
<button 
onClick={() => {
setIsManual(false);
setShowManualForm(false);
setManualDate(format(new Date(), 'yyyy-MM-dd'));
setManualTime(format(new Date(), 'HH:mm'));
}}
className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 text-[10px] font-bold transition-colors"
title="Reset to Automatic"
>
<RotateCcw className="w-3 h-3" /> AUTO
</button>
</div>
<div className="grid grid-cols-2 gap-4">
<div className="space-y-1.5">
<label className="text-[10px] font-bold text-slate-400 uppercase">Set Date</label>
<input 
type="date" 
value={manualDate}
onChange={(e) => {
setManualDate(e.target.value);
setIsManual(true);
}}
className="w-full p-2 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-blue-500"
/>
</div>
<div className="space-y-1.5">
<label className="text-[10px] font-bold text-slate-400 uppercase">Set Time</label>
<input 
type="time" 
value={manualTime}
onChange={(e) => {
setManualTime(e.target.value);
setIsManual(true);
}}
className="w-full p-2 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-blue-500"
/>
</div>
</div>
<div className="space-y-4">
<div className="flex items-center justify-between">
<h5 className="text-xs font-bold text-slate-900">{format(calendarMonth, 'MMMM yyyy')}</h5>
<div className="flex gap-1">
<button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="p-1 hover:bg-slate-100 rounded">
<ChevronLeft className="w-4 h-4 text-slate-400" />
</button>
<button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-1 hover:bg-slate-100 rounded">
<ChevronRight className="w-4 h-4 text-slate-400" />
</button>
</div>
</div>
<div className="grid grid-cols-7 gap-1 text-center">
{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, i) => (
<span key={i} className="text-[10px] font-bold text-slate-400">{day.charAt(0)}</span>
))}
{calendarDays.map((day, i) => (
<button
key={i}
onClick={() => {
setManualDate(format(day, 'yyyy-MM-dd'));
setIsManual(true);
}}
className={cn(
"h-8 w-full flex items-center justify-center rounded-lg text-xs transition-all",
!isSameMonth(day, monthStart) ? "text-slate-300" : "text-slate-700",
isSameDay(day, displayedTime) ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-200" : "hover:bg-slate-100"
)}
>
{format(day, 'd')}
</button>
))}
</div>
</div>
<button 
onClick={() => setShowManualForm(false)}
className="w-full bg-slate-900 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
>
Close Settings
</button>
</div>
)}
</div>
);
};
