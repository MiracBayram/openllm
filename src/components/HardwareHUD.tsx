import { useEffect, useRef, useMemo, useState } from 'react';
import { useHardwareLerp } from '../hooks/useHardwareLerp';
import { useTelemetryHUD } from '../store/telemetryStore';
import { useChatStore } from '../store/chatStore';
import { usePersonaStore } from '../store/personaStore';
import { invoke } from '@tauri-apps/api/core';
import { Eye, EyeOff, Skull, ShieldAlert, Activity } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { useInferenceStore } from '../store/inference';
import { OtopsiOverlay } from './ui/OtopsiOverlay';

// === 1. RADIAL GAUGE (SVG) ===
function RadialGauge({ value, max, label, subLabel, colorHex, flash = 0 }: { value: number, max: number, label: string, subLabel: string, colorHex: string, flash?: number }) {
  const normalized = Math.min(Math.max(value / max, 0), 1);
  const radius = 30;
  const circumference = 2 * Math.PI * radius * 0.75; // 270 degrees
  const dashoffset = circumference * (1 - normalized);
  
  // Flash effect calculates extra scale and shadow
  const scale = 1 + (flash * 0.05);
  const shadowOpacity = 0.5 + (flash * 0.5);

  return (
    <div className="flex flex-col items-center">
      <div 
        className="relative w-[80px] h-[80px] flex items-center justify-center transition-all duration-75"
        style={{ transform: `scale(${scale})` }}
      >
        <svg className="absolute inset-0 w-full h-full transform rotate-135" viewBox="0 0 80 80">
          <circle 
            cx="40" cy="40" r={radius} 
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6"
            strokeDasharray={`${circumference} ${2 * Math.PI * radius}`}
            strokeLinecap="round"
          />
          {normalized > 0 && (
            <circle 
              cx="40" cy="40" r={radius} 
              fill="none" stroke={colorHex} strokeWidth="4"
              strokeDasharray={`${circumference} ${2 * Math.PI * radius}`}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              className="transition-all duration-300 ease-out drop-shadow-[0_0_8px_currentColor]"
            />
          )}
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-[14px] font-bold" style={{ color: colorHex, textShadow: `0 0 8px ${colorHex}` }}>
            {Math.round(normalized * 100)}%
          </span>
        </div>
      </div>
      <span className="text-[10px] text-forge-text-secondary mt-1 tracking-widest">{label}</span>
      <span className="text-[9px] text-forge-text-muted font-mono">{subLabel}</span>
    </div>
  );
}

// === 2. SCROLL GRAPH (CANVAS) ===
function ScrollGraph({ value, label, unit, colorHex }: { value: number, label: string, unit: string, colorHex: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const capacity = 60; // frames

  useEffect(() => {
    historyRef.current.push(value);
    if (historyRef.current.length > capacity) historyRef.current.shift();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(...historyRef.current, 10);
    
    // Draw Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (historyRef.current.length < 2) return;

    // Draw Line
    ctx.beginPath();
    historyRef.current.forEach((val, i) => {
      const x = (i / (capacity - 1)) * w;
      const y = h - (val / maxVal) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = colorHex;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Fill
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = `${colorHex}15`; // ~10% opacity
    ctx.fill();

  }, [value, colorHex]);

  return (
    <div className="flex flex-col gap-1 w-full border border-forge-border rounded bg-forge-surface-2 p-1">
      <div className="flex justify-between items-center px-1">
        <span className="text-[9px] text-forge-text-secondary tracking-widest uppercase">{label}</span>
        <span className="text-[10px] font-bold" style={{ color: colorHex, textShadow: `0 0 5px ${colorHex}` }}>
          {value.toFixed(1)} <span className="text-[9px] text-forge-text-muted">{unit}</span>
        </span>
      </div>
      <canvas ref={canvasRef} className="w-full h-[40px]" />
    </div>
  );
}

// === 3. METRIC BAR (HTML) ===
function MetricBar({ label, valueStr, progress, colorHex }: { label: string, valueStr: string, progress: number, colorHex: string }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-center">
        <span className="text-[9px] text-forge-text-secondary tracking-widest uppercase">{label}</span>
        <span className="text-[10px] font-mono text-forge-text-muted">{valueStr}</span>
      </div>
      <div className="w-full h-[6px] bg-forge-surface-3 rounded-full overflow-hidden relative">
        <div 
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-300"
          style={{ 
            width: `${Math.min(Math.max(progress * 100, 0), 100)}%`, 
            backgroundColor: colorHex,
            boxShadow: `0 0 8px ${colorHex}`
          }}
        />
      </div>
    </div>
  );
}

// === 4. CELL GRID (CANVAS) ===
function CellGrid({ used, total, label, colorHex }: { used: number, total: number, label: string, colorHex: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const cols = 32;
    const rows = Math.ceil(total / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const size = Math.min(cellW, cellH, 6); // Max size 6px
    
    // Center the grid
    const startX = (w - (size * cols)) / 2;
    const startY = (h - (size * rows)) / 2;

    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * size;
      const y = startY + row * size;

      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, size - 1, size - 1, 1);
      
      if (i < used) {
        ctx.fillStyle = colorHex;
        ctx.shadowBlur = 4;
        ctx.shadowColor = colorHex;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
  }, [used, total, colorHex]);

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-center">
        <span className="text-[9px] text-forge-text-secondary tracking-widest uppercase">{label}</span>
        <span className="text-[10px] font-mono text-forge-text-muted">{used} / {total}</span>
      </div>
      <canvas ref={canvasRef} className="w-full h-[64px]" />
    </div>
  );
}

// === MAIN COMPONENT ===
export function HardwareHUD() {
  const { vramUsedMb, ramUsedMb } = useHardwareLerp();
  const { tps } = useTelemetryHUD();
  const ttftMs = (useTelemetryHUD() as any).ttftMs || 0;
  const isGenerating = useChatStore(s => s.activeMessage !== null);
  
  // Calculate simulated metrics for visual effect since we don't have the real Rust engine backend metrics
  // TTFT Target
  const ttftRatio = isGenerating ? Math.min(ttftMs / 300, 1) : 0;
  
  // Sparsity (Sub-1-Bit engine simulated metric)
  const sparsity = isGenerating ? 0.65 + (Math.sin(Date.now() / 1000) * 0.1) : 0.05;
  
  // KV Pages Used (grows while generating)
  const [kvPages, setKvPages] = useState(0);
  useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        setKvPages(prev => Math.min(prev + 1, 1024));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setKvPages(0);
    }
  }, [isGenerating]);

  // Re-calculate colors when persona changes
  const activePersonaId = usePersonaStore(s => s.activePersonaId);
  const [colors, setColors] = useState({ accent: '#00E5FF', warning: '#FFD600', danger: '#FF2D95' });
  
  useEffect(() => {
    const timer = setTimeout(() => {
      const style = getComputedStyle(document.documentElement);
      setColors({
        accent: style.getPropertyValue('--forge-accent').trim() || '#00E5FF',
        warning: style.getPropertyValue('--forge-warning').trim() || '#FFD600',
        danger: style.getPropertyValue('--forge-danger').trim() || '#FF2D95'
      });
    }, 100); // Wait for CSS vars to be applied
    return () => clearTimeout(timer);
  }, [activePersonaId]);
  
  // Heartbeat pulse effect on TPS update
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (tps > 0) {
      setFlash(Math.min(tps / 20, 1)); // stronger flash for higher tps
      const timer = setTimeout(() => setFlash(0), 150);
      return () => clearTimeout(timer);
    }
  }, [tps]);

  const [ghostEnabled, setGhostEnabled] = useState(false);
  const [aggressiveMode, setAggressiveMode] = useState(false);
  const [otopsiVisible, setOtopsiVisible] = useState(false);
  const [victim, setVictim] = useState<{name: string, action: string} | null>(null);
  
  const modelPath = useInferenceStore(s => s.config.modelPath);

  useTauriEvent<any>('forge://predation', (payload) => {
    setVictim({ name: payload.name, action: payload.action_taken });
    // Reset victim after 5 seconds
    setTimeout(() => setVictim(null), 5000);
  });

  // Check VRAM redline and trigger predation
  const lastPredationRef = useRef<number>(0);
  useEffect(() => {
    if (aggressiveMode && vramUsedMb > 7700) { // ~95% of 8GB
      const now = Date.now();
      if (now - lastPredationRef.current > 5000) { // 5 second throttle
        lastPredationRef.current = now;
        invoke('trigger_predation').catch(console.error);
      }
    }
  }, [vramUsedMb, aggressiveMode]);

  const toggleGhost = async () => {
    try {
      const enabled = await invoke<boolean>('toggle_ghost_hud');
      setGhostEnabled(enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const sparsityColor = sparsity < 0.3 ? colors.accent : sparsity < 0.7 ? '#FF2ACC' : colors.danger;

  return (
    <div 
      className="absolute bottom-6 right-6 z-40 w-[240px] skeuo-panel p-4 flex flex-col gap-4 text-forge-text font-sans opacity-80 backdrop-blur-xl transition-all duration-300"
      style={{ boxShadow: flash > 0 ? `0 0 ${20 + flash * 30}px -12px var(--forge-accent)` : undefined }}
    >
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <filter id="glitch">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.5" numOctaves="2" result="noise" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3 -1" in="noise" result="coloredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="coloredNoise" scale="10" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className="flex items-center justify-between mb-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-forge-accent animate-pulse shadow-[0_0_8px_var(--forge-accent)]" />
          <span className="text-[10px] tracking-widest font-bold uppercase text-forge-accent">Telemetry HUD</span>
        </div>
        <div className="flex gap-1">
          {modelPath && (
            <button 
              onClick={() => setOtopsiVisible(true)}
              className="p-1 rounded transition-colors text-forge-text-muted hover:text-forge-accent"
              title="Otopsi (Live Tensor Inspection)"
            >
              <Icon icon={Activity} size={12} />
            </button>
          )}
          <button 
            onClick={() => setAggressiveMode(!aggressiveMode)}
            className={`p-1 rounded transition-colors ${aggressiveMode ? 'text-red-500 bg-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse' : 'text-forge-text-muted hover:text-red-400'}`}
            title="Aggressive Mode (The Hunger) - Starve competing processes"
          >
            <Icon icon={aggressiveMode ? Skull : ShieldAlert} size={12} />
          </button>
          <button 
            onClick={toggleGhost}
            className={`p-1 rounded transition-colors ${ghostEnabled ? 'text-forge-accent bg-forge-accent/20' : 'text-forge-text-muted hover:text-forge-text'}`}
            title="Toggle Ghost HUD (System-wide Overlay)"
          >
            <Icon icon={ghostEnabled ? Eye : EyeOff} size={12} />
          </button>
        </div>
      </div>

      {victim && (
        <div 
          className="w-full bg-forge-danger-bg border border-forge-danger p-2 rounded flex flex-col gap-1 items-center skeuo-bevel-in"
          style={{ filter: 'url(#glitch)', animation: 'pulse 0.2s infinite' }}
        >
          <span className="text-[10px] text-forge-danger uppercase tracking-widest font-bold font-primary text-shadow-glow">SYS.THROTTLE</span>
          <span className="text-[11px] font-mono text-white text-center break-all">{victim.name}</span>
          <span className="text-[8px] text-forge-danger font-mono text-center opacity-80">{victim.action}</span>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <RadialGauge 
          value={vramUsedMb} 
          max={8192} 
          label="VRAM" 
          subLabel={`${(vramUsedMb / 1024).toFixed(1)} / 8 GB`} 
          colorHex={colors.accent} 
          flash={flash}
        />
        <RadialGauge 
          value={ramUsedMb} 
          max={16384} 
          label="RAM" 
          subLabel={`${(ramUsedMb / 1024).toFixed(1)} / 16 GB`} 
          colorHex={colors.warning} 
          flash={flash}
        />
      </div>

      <ScrollGraph 
        value={tps} 
        label="Token Speed" 
        unit="Tok/s" 
        colorHex="#B6FF3D" 
      />

      <MetricBar 
        label="TTFT" 
        valueStr={`${Math.round(ttftMs)} ms`} 
        progress={ttftRatio} 
        colorHex={colors.accent} 
      />

      <MetricBar 
        label="Sparsity" 
        valueStr={sparsity.toFixed(2)} 
        progress={sparsity} 
        colorHex={sparsityColor} 
      />

      <CellGrid 
        used={kvPages} 
        total={1024} 
        label="KV Pages" 
        colorHex={sparsityColor} 
      />
      {otopsiVisible && modelPath && (
        <OtopsiOverlay modelPath={modelPath} onClose={() => setOtopsiVisible(false)} />
      )}
    </div>
  );
}
