import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface SearchSelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  /** Compact styling for dense forms */
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

/**
 * Type a letter or two, tap the match. Single choice; tap the X to clear.
 * Only offers real options, so the stored value is always one of them.
 */
export default function SearchSelect({
  options, value, onChange, placeholder = 'Type to search...', emptyText = 'No matches.',
  size = 'md', disabled, className,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [options, query]);

  const pick = (o: SearchSelectOption) => {
    onChange(o.value);
    setQuery('');
    setOpen(false);
  };

  const inputSize = size === 'sm' ? 'p-2 text-sm rounded-lg' : 'p-3 rounded-xl';

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={open ? query : (selected?.label ?? '')}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected && !open ? undefined : placeholder}
          autoComplete="off"
          className={cn(
            'w-full pr-14 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50',
            inputSize
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selected && !disabled && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(''); setQuery(''); }}
              className="p-1 text-slate-400 hover:text-red-500"
              aria-label="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>
      {open && !disabled && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">{emptyText}</p>
          ) : (
            filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(o)}
                className={cn(
                  'w-full flex items-center justify-between text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors',
                  o.value === value && 'bg-blue-50 font-bold'
                )}
              >
                <span className="font-medium">{o.label}</span>
                {o.hint && <span className="text-xs text-slate-400 ml-2 shrink-0">{o.hint}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
