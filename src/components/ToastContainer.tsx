import { useToastStore, ToastType } from '../store/toastStore';
import { X, CheckCircle2, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { Icon } from './ui/Icon';

const typeConfig: Record<ToastType, { icon: any; bgColor: string; borderColor: string; textColor: string }> = {
  success: {
    icon: CheckCircle2,
    bgColor: 'bg-forge-success-bg',
    borderColor: 'border-forge-success/50',
    textColor: 'text-forge-success'
  },
  error: {
    icon: AlertOctagon,
    bgColor: 'bg-forge-danger-bg',
    borderColor: 'border-forge-danger/50',
    textColor: 'text-forge-danger'
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-forge-warning-bg',
    borderColor: 'border-forge-warning/50',
    textColor: 'text-forge-warning'
  },
  info: {
    icon: Info,
    bgColor: 'bg-forge-accent-muted',
    borderColor: 'border-forge-accent/50',
    textColor: 'text-forge-accent'
  }
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map((toast) => {
        const config = typeConfig[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3 rounded-lg border shadow-lg backdrop-blur-md animate-in slide-in-from-right-4 fade-in duration-300 ${config.bgColor} ${config.borderColor}`}
          >
            <Icon icon={config.icon} className={`w-5 h-5 shrink-0 mt-0.5 ${config.textColor}`} />
            <div className="flex-1 flex flex-col gap-1">
              <span className={`text-sm font-semibold ${config.textColor}`}>{toast.title}</span>
              {toast.message && <span className="text-xs text-forge-text-muted leading-snug">{toast.message}</span>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-forge-text-muted hover:text-forge-text transition-colors shrink-0"
            >
              <Icon icon={X} size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
