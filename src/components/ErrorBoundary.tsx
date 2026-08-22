import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { motion } from 'motion/react';
interface Props {
children: ReactNode;
}
interface State {
hasError: boolean;
error: Error | null;
}
export class ErrorBoundary extends React.Component<any, any> {
state = {
hasError: false,
error: null
};
static getDerivedStateFromError(error: Error): State {
return { hasError: true, error };
}
componentDidCatch(error: Error, errorInfo: ErrorInfo) {
console.error('Uncaught error:', error, errorInfo);
}
handleReset = () => {
window.location.href = '/';
};
render() {
const { children } = (this as any).props;
if (this.state.hasError) {
return (
<div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
<motion.div 
initial={{ opacity: 0, scale: 0.9 }}
animate={{ opacity: 1, scale: 1 }}
className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-100 p-10 text-center space-y-8"
>
<div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto">
<AlertTriangle className="w-12 h-12 text-red-600" />
</div>
<div className="space-y-2">
<h1 className="text-2xl font-black text-slate-900">Something went wrong</h1>
<p className="text-slate-500 font-medium">
The application encountered an unexpected error. Don't worry, your data is safe.
</p>
</div>
{this.state.error && (
<div className="p-4 bg-slate-50 rounded-xl text-left overflow-auto max-h-32">
<code className="text-[10px] text-red-500 font-mono break-all">
{this.state.error.toString()}
</code>
</div>
)}
<div className="flex flex-col gap-3">
<button
onClick={() => window.location.reload()}
className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
>
<RefreshCcw className="w-5 h-5" />
Reload Application
</button>
<button
onClick={this.handleReset}
className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 py-4 rounded-xl font-bold hover:bg-slate-50 transition-all"
>
<Home className="w-5 h-5" />
Reset App State
</button>
</div>
<p className="text-[10px] text-slate-400 font-medium">
If the problem persists, please contact technical support.
</p>
</motion.div>
</div>
);
}
return children;
}
}
