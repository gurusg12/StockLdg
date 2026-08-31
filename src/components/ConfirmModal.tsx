import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="confirm-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        id="confirm-modal-box"
        className="w-full max-w-sm bg-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-200 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
            isDestructive ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'
          }`}
        >
          <AlertCircle className="w-6 h-6" />
        </div>

        <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
        <p className="text-xs sm:text-sm text-slate-600 mb-5 leading-relaxed">{message}</p>

        <div className="flex gap-3">
          <button
            id="confirm-modal-cancel-btn"
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs sm:text-sm transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            id="confirm-modal-confirm-btn"
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm text-white shadow-sm transition-colors ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                : 'bg-sky-600 hover:bg-sky-700 shadow-sky-200'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
