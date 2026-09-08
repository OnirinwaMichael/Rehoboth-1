import React from 'react';
import { ClinicalLetter, Patient } from '../types';
import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';

interface Props {
  letter: ClinicalLetter;
  patient?: Patient;
  onClose: () => void;
}

export const LetterheadPrint: React.FC<Props> = ({ letter, patient, onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="w-full max-w-[210mm] bg-white rounded-xl shadow-2xl print:shadow-none print:rounded-none my-6">
        {/* Toolbar — hidden when printing */}
        <div className="print:hidden flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <p className="font-bold text-slate-900">
            {letter.letterType === 'referral' ? 'Referral Letter' : 'Diagnosis Letter'} Preview
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable letterhead sheet, min-height approximates an A4 page */}
        <div className="p-10 print:p-8 text-slate-900 min-h-[280mm] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between border-b-4 border-rose-800 pb-4 mb-6">
            <h1 className="text-2xl font-black text-emerald-800 uppercase tracking-tight leading-tight">
              The Rehoboth<br />Clinic & Maternity
            </h1>
            <div className="text-right text-[11px] text-slate-600">
              <p className="font-bold uppercase">Address:</p>
              <p>Adogbe-Odole-Mopa</p>
              <p>Mopamuro L.G.A. Kogi State</p>
              <p>Tel: 08054894848</p>
            </div>
          </div>

          {/* Ref block */}
          <div className="flex justify-between text-xs mb-6">
            <div className="space-y-1">
              <p><span className="font-bold">Our Ref:</span> {letter.ourRef || '—'}</p>
              <p><span className="font-bold">Your Ref:</span> {letter.yourRef || '—'}</p>
            </div>
            <p><span className="font-bold">Date:</span> {format(new Date(letter.createdAt), 'MMM d, yyyy')}</p>
          </div>

          {letter.letterType === 'referral' && letter.referredTo && (
            <p className="text-sm mb-4"><span className="font-bold">Referred To:</span> {letter.referredTo}</p>
          )}

          <p className="text-sm mb-4">
            <span className="font-bold">Re: </span>
            {letter.letterType === 'referral' ? 'Patient Referral' : 'Patient Diagnosis'} — {patient?.name || letter.patientId}
            {patient?.cardId && <span className="text-slate-500"> (Card No: {patient.cardId})</span>}
          </p>

          {/* Body — bordered writing area like the physical letterhead */}
          <div className="flex-1 border-2 border-rose-800 rounded-sm p-6 min-h-[300px] whitespace-pre-wrap text-sm leading-relaxed">
            {letter.body}
          </div>

          <div className="mt-8 flex justify-between items-end text-xs">
            <p className="italic text-slate-500">"With his stripes we are healed." — Isaiah 53:5B</p>
            <div className="text-center">
              <p className="border-t border-slate-400 pt-1 px-8">Signature</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
