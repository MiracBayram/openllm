import { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Icon } from './ui/Icon';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-forge-surface border border-forge-border rounded-xl shadow-2xl max-w-sm w-full mx-4 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-full shrink-0 ${isDanger ? 'bg-forge-danger-bg text-forge-danger' : 'bg-forge-accent-muted text-forge-accent'}`}>
              <Icon icon={AlertTriangle} size={20} />
            </div>
            <div className="flex flex-col gap-1 mt-0.5">
              <h2 className="text-lg font-semibold text-forge-text">{title}</h2>
              <div className="text-sm text-forge-text-secondary leading-relaxed">
                {description}
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-forge-surface-2 p-4 flex justify-end gap-3 border-t border-forge-border">
          <button 
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-sm font-medium text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-3 transition-colors"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
              isDanger 
                ? 'bg-forge-danger text-white hover:bg-red-600' 
                : 'bg-forge-accent text-white hover:bg-indigo-600'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
