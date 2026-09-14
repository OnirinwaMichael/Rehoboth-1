import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { cn } from '../lib/utils';

interface Props {
  onFinalResult: (text: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const VoiceDictationButton: React.FC<Props> = ({ onFinalResult, className, size = 'sm' }) => {
  const { isSupported, isListening, interimText, startListening, stopListening } = useVoiceDictation(onFinalResult);

  if (!isSupported) return null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (isListening ? stopListening() : startListening())}
        title={isListening ? 'Stop dictation' : 'Dictate by voice'}
        className={cn(
          'shrink-0 rounded-full flex items-center justify-center transition-all',
          size === 'sm' ? 'w-7 h-7' : 'w-9 h-9',
          isListening
            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-200'
            : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600',
          className
        )}
      >
        {isListening ? <MicOff className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> : <Mic className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
      </button>
      {isListening && interimText && (
        <div className="absolute z-30 top-full right-0 mt-1 w-56 bg-slate-900 text-white text-[10px] p-2 rounded-lg shadow-xl">
          {interimText}
        </div>
      )}
    </div>
  );
};
