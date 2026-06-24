import { useConfigStore } from '../store/configStore';
import { useServerStore } from '../store/serverStore';
import { useHardwareLerp } from '../hooks/useHardwareLerp';
import { Terminal, Database, Server, Cpu } from 'lucide-react';
import { Icon } from './ui/Icon';

export function StatusBar() {
  const { oomRisk } = useHardwareLerp();
  const config = useConfigStore(s => s.config);
  const serverStatus = useServerStore(s => s.status);

  return (
    <div className="flex-none h-[22px] bg-forge-surface-2 border-t border-forge-border text-[10px] font-mono text-forge-text-muted flex items-center justify-between px-3 select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 hover:text-forge-accent transition-colors cursor-pointer">
          <Icon icon={Terminal} size={10} />
          <span className="tracking-widest font-semibold">FORGE VISION</span>
        </div>
        <div className="w-[1px] h-3 bg-forge-border" />
        <div className="flex items-center gap-1.5">
          <Icon icon={Database} size={10} />
          <span className="max-w-[200px] truncate opacity-70">
            {config?.storage?.models_directory || '~/models'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Icon icon={Server} size={10} className={serverStatus === 'online' ? 'text-forge-success drop-shadow-[0_0_2px_var(--forge-success)]' : 'text-forge-danger'} />
          <span className="uppercase opacity-80">{serverStatus}</span>
        </div>
        <div className="w-[1px] h-3 bg-forge-border" />
        <div className="flex items-center gap-1.5 opacity-80">
          <Icon icon={Cpu} size={10} />
          <span>Sub-1-Bit Engine</span>
        </div>
        <div className="w-[1px] h-3 bg-forge-border" />
        <div className={`flex items-center gap-1.5 uppercase font-bold tracking-wider ${
          oomRisk === 'Safe' ? 'text-forge-success drop-shadow-[0_0_2px_var(--forge-success)]' :
          oomRisk === 'Marginal' ? 'text-forge-warning drop-shadow-[0_0_2px_var(--forge-warning)]' :
          oomRisk === 'Unknown' ? 'text-forge-text-muted' :
          'text-forge-danger animate-pulse drop-shadow-[0_0_2px_var(--forge-danger)]'
        }`}>
          SYS: {oomRisk}
        </div>
      </div>
    </div>
  );
}
