import { useState, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { useInferenceStore } from '../store/inference';
import { useModelsStore } from '../store/models';
import { useConfigStore } from '../store/configStore';
import {  Settings2, SlidersHorizontal, PanelRightClose, Cpu, Activity  } from 'lucide-react';
import { Icon } from './ui/Icon';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';
import { Select } from './ui/Select';
import { invoke } from '@tauri-apps/api/core';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { TelemetryChart } from './ui/TelemetryChart';
import { useHardwareLerp } from '../hooks/useHardwareLerp';
import { useHardwareStore } from '../store/hardware';
import { calculateRequiredVRAM, calculateOOMRisk } from '../utils/oomCalculator';
import { SpringSlider } from './ui/SpringSlider';

interface EngineRecommendation {
  primary: string;
  score: number;
  reason: string;
  oom_risk: string;
}

export function RightInspector() {
  const { inspectorOpen, toggleInspector, setSystemPromptModalOpen } = useUiStore();
  const { config: infConfig, setConfig } = useInferenceStore();
  const { models, scanModels } = useModelsStore();
  const { config: appConfig } = useConfigStore();
  const { cpuUsage, vramUsedMb, ramUsedMb } = useHardwareLerp();
  const { profile } = useHardwareStore();
  
  const totalRam = profile?.memory?.total_mb || 32000;
  const totalVram = profile?.gpus?.[0]?.vram_mb || 24000;

  useEffect(() => {
    if (appConfig?.storage.models_directory) {
      scanModels(appConfig.storage.models_directory);
    }
  }, [appConfig?.storage.models_directory, scanModels]);

  const [engineRec, setEngineRec] = useState<EngineRecommendation | null>(null);
  const [stats, setStats] = useState<{tps: number, duration: number}>({ tps: 0, duration: 0 });
  const [engineStatus, setEngineStatus] = useState<'idle' | 'loading' | 'ready' | 'running' | 'error'>('idle');

  useTauriEvent<any>('forge://stats', (payload) => {
    if (payload?.tokens_per_sec) {
      setStats(prev => ({ ...prev, tps: parseFloat(payload.tokens_per_sec.toFixed(2)) }));
    }
  });

  useTauriEvent<any>('forge://done', (payload) => {
    if (payload?.duration_ms) {
      setStats(prev => ({ ...prev, duration: payload.duration_ms }));
      setEngineStatus('ready');
    }
  });

  useTauriEvent<any>('forge://engine_ready', () => setEngineStatus('ready'));
  useTauriEvent<any>('forge://error', () => setEngineStatus('error'));

  // Quick effect to set engine loading when inference starts (assuming we know when it starts, maybe when stream bypass is active, but we can set it locally if needed)

  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (infConfig.modelPath) {
      setIsScanning(true);
      setEngineRec(null);
      // Simulate scan delay
      setTimeout(() => {
        invoke<EngineRecommendation>('suggest_engine', {
          modelPath: infConfig.modelPath!
        }).then((rec) => {
          setEngineRec(rec);
          setIsScanning(false);
        }).catch((e) => {
          console.error(e);
          setIsScanning(false);
        });
      }, 800);
    } else {
      setEngineRec(null);
      setIsScanning(false);
    }
  }, [infConfig.modelPath]);

  if (!inspectorOpen) return null;

  return (
    <div className="w-80 bg-forge-bg border-l border-forge-border flex flex-col h-full shrink-0 z-40 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="h-14 border-b border-forge-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 text-forge-text font-semibold text-sm">
          <Icon icon={Settings2} size={18} />
          <span>Configuration</span>
        </div>
        <button onClick={toggleInspector} className="text-forge-text-muted hover:text-forge-text transition-colors">
          <Icon icon={PanelRightClose} size={18} />
        </button>
      </div>

      <div className="p-6 flex flex-col gap-8">
        {/* Model Selection */}
        {/* Model Selection & Metadata Inspector */}
        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-bold text-forge-text-muted uppercase tracking-widest flex items-center gap-2">
            <Icon icon={Cpu} size={12} /> Loaded Weights
          </label>
          
          {/* Premium Select Wrapper */}
          <div className="relative group z-50">
            <Select 
              value={infConfig.modelPath || ""}
              options={[
                { label: "Initialize Inference Engine...", value: "" },
                ...models.map(m => ({ label: m.name, value: m.path }))
              ]}
              onChange={(val) => setConfig({ ...infConfig, modelPath: val })}
              className="w-full"
              renderValue={(opt) => opt?.value ? opt.label : "Initialize Inference Engine..."}
              renderOption={(opt: any) => {
                if (!opt.value) return <span className="text-forge-text-muted">{opt.label}</span>;
                const m = models.find(x => x.path === opt.value);
                return (
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-forge-text truncate">{m?.name}</span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-forge-text-muted">{(m!.size_mb / 1024).toFixed(1)} GB</span>
                      <span className="text-forge-accent px-1.5 py-0.5 rounded bg-forge-accent/10">{m?.quant_label || 'GGUF'}</span>
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {/* Metadata Badges (Stickers) - THE LM STUDIO KILLER FEATURE */}
          {infConfig.modelPath ? (() => {
            const activeModel = models.find(m => m.path === infConfig.modelPath);
            if (!activeModel) return null;
            
            const reqVRAM = calculateRequiredVRAM(
              activeModel.size_mb, 
              activeModel.layer_count, 
              activeModel.embedding_length, 
              infConfig.ctx_size || 4096
            );
            
            let vramRisk: 'Safe' | 'Marginal' | 'Critical' | 'Unknown' = 'Safe';
            if (profile && profile.gpus && profile.gpus.length > 0) {
                vramRisk = calculateOOMRisk(reqVRAM, profile.gpus[0].vram_mb);
            }

            return (
              <div className="flex flex-wrap gap-2 mt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                <Badge color="blue">{activeModel.architecture.toUpperCase()}</Badge>
                <Badge color="purple" uppercase>{activeModel.quant_label || 'GGUF'}</Badge>
                <Badge color={vramRisk === 'Safe' ? 'emerald' : vramRisk === 'Marginal' ? 'amber' : vramRisk === 'Unknown' ? 'zinc' : 'red'}>
                  ≈ {(reqVRAM / 1024).toFixed(1)} GB VRAM {vramRisk !== 'Safe' ? `(${vramRisk})` : ''}
                </Badge>
                <Badge color="amber">{activeModel.layer_count} Layers</Badge>
                <Badge color="zinc">{activeModel.embedding_length} Embed</Badge>
                {activeModel.chat_template && (
                  <Badge color="blue">Chat Template</Badge>
                )}
              </div>
            );
          })() : (
            <EmptyState />
          )}
        </div>

        {/* Engine Telemetry Badge */}
        {(engineRec || isScanning) ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-forge-text-muted uppercase tracking-widest flex items-center gap-2">
              <Icon icon={Activity} size={14} className={isScanning ? "animate-pulse text-forge-accent" : ""} />
              {isScanning ? "Scanning Topology..." : "Engine Recommendation"}
            </span>
            <div className="bg-forge-surface/50 border border-forge-accent/30 rounded-lg p-3 relative overflow-hidden min-h-[100px]">
              {isScanning ? (
                <div className="absolute inset-0 p-3 font-mono text-[8px] text-forge-accent/50 leading-tight overflow-hidden break-all flex flex-col justify-end">
                  <div className="animate-pulse mb-2 text-forge-accent text-xs font-bold tracking-widest border-b border-forge-accent/30 pb-1 w-max">
                    ANALYZING TENSORS...
                  </div>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="whitespace-nowrap" style={{ animation: `pulse ${0.5 + Math.random()}s infinite` }}>
                      {Array.from({length: 16}, () => Math.floor(Math.random()*256).toString(16).padStart(2, '0')).join(' ')}
                    </div>
                  ))}
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-forge-accent/50 shadow-[0_0_8px_var(--forge-accent)]" style={{ animation: 'scanline 0.8s linear infinite' }} />
                </div>
              ) : engineRec ? (
                <div className="animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-forge-accent">
                      {engineRec.primary}
                    </span>
                    <span className="text-[10px] font-mono text-forge-text-secondary bg-forge-bg px-2 rounded-md border border-forge-border">
                      Score: {engineRec.score}
                    </span>
                  </div>
                  <p className="text-[10px] text-forge-text-muted mt-2 mb-2 leading-relaxed">
                    {engineRec.reason}
                  </p>
                  <Badge color={engineRec.oom_risk === 'High' ? 'red' : engineRec.oom_risk === 'Medium' ? 'amber' : 'emerald'}>
                    OOM Risk: {engineRec.oom_risk}
                  </Badge>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-forge-text-muted uppercase tracking-widest">Engine Status</span>
              <div className="bg-forge-surface/50 border border-forge-border/50 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    engineStatus === 'idle' ? 'bg-forge-text-muted' :
                    engineStatus === 'loading' ? 'bg-amber-400 animate-pulse' :
                    engineStatus === 'ready' ? 'bg-emerald-400' :
                    engineStatus === 'running' ? 'bg-forge-accent animate-pulse' :
                    'bg-red-400'
                  }`} />
                  <span className={`text-sm font-medium ${
                    engineStatus === 'idle' ? 'text-forge-text-muted' :
                    engineStatus === 'loading' ? 'text-amber-400' :
                    engineStatus === 'ready' ? 'text-emerald-400' :
                    engineStatus === 'running' ? 'text-forge-accent' :
                    'text-red-400'
                  }`}>
                    {engineStatus === 'idle' ? 'OFFLINE' :
                     engineStatus === 'loading' ? 'LOADING' :
                     engineStatus === 'ready' ? 'READY' :
                     engineStatus === 'running' ? 'GENERATING' :
                     'ERROR'}
                  </span>
                </div>
              </div>
          </div>
        )}

        {/* System Monitor */}
        <div className="flex flex-col gap-4">
          <label className="text-xs font-semibold text-forge-text-muted uppercase tracking-wider flex items-center gap-2">
            <Icon icon={Activity} size={14} /> System Monitor
          </label>
          <div className="flex flex-col gap-3">
            {/* CPU */}
            <div className="bg-forge-surface-2 border border-forge-border rounded-lg p-3 flex flex-col gap-2 relative overflow-hidden group">
              <div className="flex justify-between items-center z-10 relative">
                <span className="text-[10px] text-forge-text-muted font-bold tracking-widest uppercase">CPU Usage</span>
                <span className="text-xs font-mono text-forge-text">{cpuUsage}%</span>
              </div>
              <div className="absolute inset-0 top-6 opacity-60 group-hover:opacity-100 transition-opacity">
                <TelemetryChart currentValue={cpuUsage} maxValue={100} color="#38bdf8" height={36} />
              </div>
              <div className="h-6" /> {/* Spacer for chart */}
            </div>
            
            {/* VRAM */}
            <div className="bg-forge-surface-2 border border-forge-border rounded-lg p-3 flex flex-col gap-2 relative overflow-hidden group">
              <div className="flex justify-between items-center z-10 relative">
                <span className="text-[10px] text-forge-text-muted font-bold tracking-widest uppercase">VRAM Usage</span>
                <span className="text-xs font-mono text-forge-text">{vramUsedMb} MB</span>
              </div>
              <div className="absolute inset-0 top-6 opacity-60 group-hover:opacity-100 transition-opacity">
                <TelemetryChart currentValue={vramUsedMb} maxValue={totalVram} color="#a78bfa" height={36} />
              </div>
              <div className="h-6" /> {/* Spacer for chart */}
            </div>

            {/* RAM */}
            <div className="bg-forge-surface-2 border border-forge-border rounded-lg p-3 flex flex-col gap-2 relative overflow-hidden group">
              <div className="flex justify-between items-center z-10 relative">
                <span className="text-[10px] text-forge-text-muted font-bold tracking-widest uppercase">RAM Usage</span>
                <span className="text-xs font-mono text-forge-text">{ramUsedMb} MB</span>
              </div>
              <div className="absolute inset-0 top-6 opacity-60 group-hover:opacity-100 transition-opacity">
                <TelemetryChart currentValue={ramUsedMb} maxValue={totalRam} color="#10b981" height={36} />
              </div>
              <div className="h-6" /> {/* Spacer for chart */}
            </div>
          </div>
        </div>

        {/* Live Telemetry */}
        <div className="flex flex-col gap-4">
          <label className="text-xs font-semibold text-forge-text-muted uppercase tracking-wider flex items-center gap-2">
            <Icon icon={Activity} size={14} /> Telemetry
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-forge-surface-2 border border-forge-border rounded-lg p-3 flex flex-col gap-1 items-center justify-center">
              <span className="text-[10px] text-forge-text-muted font-bold tracking-widest uppercase">Speed</span>
              <span className="text-lg font-mono text-forge-accent">{stats.tps} <span className="text-[10px] text-forge-text-secondary">T/s</span></span>
            </div>
            <div className="bg-forge-surface-2 border border-forge-border rounded-lg p-3 flex flex-col gap-1 items-center justify-center">
              <span className="text-[10px] text-forge-text-muted font-bold tracking-widest uppercase">Duration</span>
              <span className="text-lg font-mono text-forge-text">{stats.duration > 0 ? (stats.duration / 1000).toFixed(1) : '-'} <span className="text-[10px] text-forge-text-secondary">s</span></span>
            </div>
          </div>
        </div>

        {/* Hyperparameters */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-forge-text-muted uppercase tracking-wider flex items-center gap-2">
              <Icon icon={SlidersHorizontal} size={14} /> Hyperparameters
            </label>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            <button onClick={() => setConfig({ temperature: 0.9, top_p: 0.95, top_k: 50, repeat_penalty: 1.1 })} className="px-2 py-1 bg-forge-surface-2 hover:bg-forge-surface-3 border border-forge-border rounded text-[10px] text-forge-text-muted hover:text-forge-text transition-colors whitespace-nowrap">
              Creative
            </button>
            <button onClick={() => setConfig({ temperature: 0.7, top_p: 0.9, top_k: 40, repeat_penalty: 1.1 })} className="px-2 py-1 bg-forge-surface-2 hover:bg-forge-surface-3 border border-forge-border rounded text-[10px] text-forge-text-muted hover:text-forge-text transition-colors whitespace-nowrap">
              Balanced
            </button>
            <button onClick={() => setConfig({ temperature: 0.1, top_p: 0.95, top_k: 10, repeat_penalty: 1.1 })} className="px-2 py-1 bg-forge-surface-2 hover:bg-forge-surface-3 border border-forge-border rounded text-[10px] text-forge-text-muted hover:text-forge-text transition-colors whitespace-nowrap">
              Precise
            </button>
          </div>
          
          <div className="flex flex-col gap-5 mt-2">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-forge-text/70">
                <span className="text-[10px] text-forge-text-muted font-bold tracking-widest uppercase">Context Length</span>
              </div>
              <div className="relative z-40">
                <Select
                  value={infConfig.ctx_size?.toString() || "4096"}
                  options={[
                    { label: "2048", value: "2048" },
                    { label: "4096", value: "4096" },
                    { label: "8192", value: "8192" },
                    { label: "16384", value: "16384" },
                    { label: "32768", value: "32768" },
                  ]}
                  onChange={(val) => setConfig({ ctx_size: parseInt(val) })}
                />
              </div>
            </div>
            
            <SpringSlider
              label="GPU Layers"
              min={0}
              max={48}
              step={1}
              value={infConfig.gpu_layers ?? 33}
              onChange={(v) => setConfig({ gpu_layers: v })}
              color="var(--forge-accent)"
            />
            <div className="text-[9px] text-forge-text-muted text-center font-mono tracking-widest uppercase opacity-70 -mt-2">
              0 = CPU ONLY | MAX = FULL VRAM OFFLOAD
            </div>

            <SpringSlider
              label="Max Tokens"
              min={128}
              max={8192}
              step={128}
              value={infConfig.max_tokens}
              onChange={(v) => setConfig({ max_tokens: v })}
              color="var(--forge-success)"
            />

            <SpringSlider
              label="Temperature"
              min={0}
              max={2}
              step={0.05}
              value={infConfig.temperature}
              onChange={(v) => setConfig({ temperature: v })}
              formatValue={(v) => v.toFixed(2)}
              color="var(--forge-warning)"
              detents={[0.1, 0.7, 1.0, 1.5]}
            />

            <SpringSlider
              label="Top-P"
              min={0.1}
              max={1.0}
              step={0.05}
              value={infConfig.top_p}
              onChange={(v) => setConfig({ top_p: v })}
              formatValue={(v) => v.toFixed(2)}
              color="var(--forge-danger)"
              detents={[0.5, 0.8, 0.9, 0.95, 1.0]}
            />
            
            <SpringSlider
              label="Top-K"
              min={1}
              max={100}
              step={1}
              value={infConfig.top_k}
              onChange={(v) => setConfig({ top_k: v })}
              color="#d946ef" /* fuchsia-500 */
            />
            
            <SpringSlider
              label="Repetition Penalty"
              min={1.0}
              max={2.0}
              step={0.05}
              value={infConfig.repeat_penalty}
              onChange={(v) => setConfig({ repeat_penalty: v })}
              formatValue={(v) => v.toFixed(2)}
              color="#0ea5e9" /* sky-500 */
            />
          </div>
        </div>

        {/* System Prompt Capsule */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-semibold text-forge-text-muted uppercase tracking-widest">System Prompt</label>
          <button
            onClick={() => setSystemPromptModalOpen(true)}
            className="bg-forge-surface/50 hover:bg-forge-surface border border-forge-border/50 hover:border-forge-border rounded-lg p-3 text-sm text-forge-text/80 text-left transition-all group flex flex-col gap-1 shadow-sm"
          >
            <span className="font-mono text-[10px] text-forge-accent uppercase tracking-wider">Persona: Click to Edit</span>
            <span className="text-xs text-forge-text-muted line-clamp-3">{infConfig.system_prompt}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
