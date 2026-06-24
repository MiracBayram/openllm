import { useState, useEffect } from 'react';
import { useTauriEvent } from './hooks/useTauriEvent';
import { TelemetryRingBuffer } from './hooks/useStreamBypass'; // Reuse the ring buffer logic if needed, or just state

interface HardwareTick {
  vram_used: number;
  vram_total: number;
  ram_used: number;
  ram_total: number;
  cpu_usage: number;
}

export function GhostHud() {
  const [stats, setStats] = useState<HardwareTick | null>(null);
  const [tps, setTps] = useState(0);

  useTauriEvent<HardwareTick>('forge://hardware_tick', (payload) => {
    setStats(payload);
  });

  useTauriEvent<any>('forge://stats', (payload) => {
    if (payload?.tokens_per_sec) {
      setTps(payload.tokens_per_sec);
    }
  });

  if (!stats) return null;

  const vramPercent = (stats.vram_used / stats.vram_total) * 100;
  const isVramCritical = vramPercent > 95;

  return (
    <div className="fixed bottom-4 right-4 w-64 p-4 font-mono text-[10px] select-none pointer-events-none z-50">
      {/* Background glow instead of solid panel */}
      <div className="absolute inset-0 bg-forge-bg/20 backdrop-blur-sm border border-forge-accent/20 rounded-xl shadow-[0_0_20px_rgba(var(--forge-accent-rgb),0.1)] overflow-hidden" />
      
      {/* OOM Redline Vignette overlay for Ghost HUD */}
      {isVramCritical && (
        <div className="absolute inset-0 mix-blend-multiply shadow-[inset_0_0_50px_rgba(239,68,68,0.4)] border-2 border-red-500/50 animate-pulse rounded-xl" />
      )}

      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex justify-between items-center text-forge-accent font-bold tracking-widest border-b border-forge-accent/30 pb-1">
          <span>FORGE // GHOST</span>
          <div className="flex items-center gap-1">
            <span className={tps > 0 ? "animate-pulse text-forge-accent" : "text-forge-text-muted"}>●</span>
            <span>{tps.toFixed(1)} T/S</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 mt-1">
          <div className="flex justify-between">
            <span className="text-forge-text-muted">VRAM</span>
            <span className={isVramCritical ? "text-red-400" : "text-forge-text"}>
              {(stats.vram_used / 1024).toFixed(1)} / {(stats.vram_total / 1024).toFixed(1)} GB
            </span>
          </div>
          <div className="w-full h-1 bg-forge-surface-2 rounded overflow-hidden">
            <div 
              className={`h-full ${isVramCritical ? 'bg-red-500' : 'bg-[#a78bfa]'}`} 
              style={{ width: `${vramPercent}%` }} 
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-forge-text-muted">CPU</span>
            <span className="text-forge-text">{stats.cpu_usage.toFixed(1)}%</span>
          </div>
          <div className="w-full h-1 bg-forge-surface-2 rounded overflow-hidden">
            <div 
              className="h-full bg-[#38bdf8]" 
              style={{ width: `${stats.cpu_usage}%` }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
