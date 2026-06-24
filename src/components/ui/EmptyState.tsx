import { Server } from 'lucide-react';
import { Icon } from './Icon';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-forge-border/40 rounded-xl bg-forge-surface/20 text-center">
      <div className="w-12 h-12 rounded-full bg-forge-surface-2 flex items-center justify-center mb-3 border border-forge-border shadow-inner">
        <Icon icon={Server} className="w-5 h-5 text-forge-text-muted" />
      </div>
      <h3 className="text-sm font-semibold text-forge-text mb-1">No Weights Loaded</h3>
      <p className="text-[11px] text-forge-text-muted max-w-[220px] leading-relaxed">
        Select a model to view its hardware footprint, quantization, and inference parameters.
      </p>
    </div>
  );
}
