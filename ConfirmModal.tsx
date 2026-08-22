import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
interface ConfirmModalProps {
isOpen: boolean;
title: string;
message: string;
onConfirm: () => void;
onCancel: () => void;
confirmText?: string;
cancelText?: string;
}
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
isOpen,
title,
message,
onConfirm,
onCancel,
confirmText = 'Confirm',
cancelText = 'Cancel'
}) => {
return (
<AnimatePresence>
{isOpen && (
<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.95 }}
className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
>
<div className="p-6 border-b border-slate-100 flex items-center justify-between bg-red-50">
<h3 className="font-bold text-red-600 flex items-center gap-2">
<AlertTriangle className="w-5 h-5" /> {title}
</h3>
<button onClick={onCancel} className="p-2 hover:bg-red-100 rounded-lg transition-colors">
<X className="w-5 h-5 text-red-500" />
</button>
</div>
<div className="p-6">
<p className="text-slate-600 mb-6">{message}</p>
<div className="flex gap-4">
<button
onClick={onCancel}
className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
>
{cancelText}
</button>
<button
onClick={() => {
onConfirm();
onCancel();
}}
className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
>
{confirmText}
</button>
</div>
</div>
</motion.div>
</div>
)}
</AnimatePresence>
);
};
