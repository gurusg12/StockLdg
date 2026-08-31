import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-sky-400 shrink-0" />;
    }
  };

  const getBg = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-slate-900 border-emerald-500/40 text-slate-100';
      case 'error':
        return 'bg-slate-900 border-rose-500/40 text-slate-100';
      case 'warning':
        return 'bg-slate-900 border-amber-500/40 text-slate-100';
      default:
        return 'bg-slate-900 border-sky-500/40 text-slate-100';
    }
  };

  return (
    <div
      id="app-toast-container"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-[92vw] w-max sm:max-w-md animate-in fade-in slide-in-from-top-4 duration-200"
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl ${getBg()}`}
      >
        {getIcon()}
        <span className="text-xs sm:text-sm font-medium pr-1 select-none">{toast.message}</span>

        {toast.undoAction && (
          <button
            id="toast-undo-button"
            onClick={() => {
              toast.undoAction?.();
              onClose();
            }}
            className="ml-auto px-2.5 py-1 text-xs font-bold bg-white/15 hover:bg-white/25 rounded-md text-amber-300 border border-white/20 transition-colors"
          >
            {toast.undoLabel || 'UNDO'}
          </button>
        )}

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1 rounded transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
