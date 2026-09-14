import React from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

// A true full-screen takeover (not a centered card) — fills the
// entire viewport so dense forms are easy to see and fill in on
// mobile, instead of being cramped into a small modal.
export const FullScreenSheet: React.FC<Props> = ({ title, subtitle, onClose, headerActions, children }) => {
  return (
    <div className="fixed inset-0 z-[70] bg-white flex flex-col">
      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerActions}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
};
