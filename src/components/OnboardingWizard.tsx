import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, ChevronRight, Zap, Hexagon, Terminal, Cpu } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useUiStore } from '../store/uiStore';
import { GlassPanel } from './ui/GlassPanel';
import { NeonButton } from './ui/NeonButton';
import { motion } from 'framer-motion';

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [hardware, setHardware] = useState<any>(null);
  const [selectedEngines, setSelectedEngines] = useState<string[]>(['llama.cpp', 'lmdeploy']);
  const [isInitializing, setIsInitializing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { setOnboardingComplete } = useUiStore();

  useEffect(() => {
    // Rust'tan donanım verisini çek
    invoke('get_hardware_profile').then((res: any) => {
      setHardware(res);
      // Auto-select defaults based on hardware
      const isNvidia = res?.gpus?.some((g: any) => g.vendor === 'Nvidia');
      if (!isNvidia) {
        setSelectedEngines(['llama.cpp']); // Mac/AMD fallback
      }
    }).catch(err => {
      console.error(err);
      setHardware({ fallback: true, name: "Unknown GPU (Fallback Mode)" });
    });
  }, []);

  const toggleEngine = (engine: string) => {
    if (selectedEngines.includes(engine)) {
      setSelectedEngines(selectedEngines.filter(e => e !== engine));
    } else {
      setSelectedEngines([...selectedEngines, engine]);
    }
  };

  const finish = async () => {
    setIsInitializing(true);
    setErrorMsg('');
    try {
      await invoke('initialize_engines', { engines: selectedEngines });
      setOnboardingComplete(true);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.toString());
    }
    setIsInitializing(false);
  };

  const skip = () => {
    setOnboardingComplete(true);
  };

  if (step === 0) {
    return (
      <div className="absolute inset-0 z-50 bg-forge-bg flex flex-col items-center justify-center p-8 text-forge-text relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-forge-accent via-forge-bg to-forge-bg" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-xl w-full flex flex-col gap-8 text-center relative z-10"
        >
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="w-24 h-24 mx-auto relative flex items-center justify-center"
          >
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-forge-accent/40 animate-spin-slow" />
            <div className="absolute inset-2 rounded-full border border-forge-accent/20 bg-forge-accent/5 backdrop-blur-md" />
            <Icon icon={Hexagon} className="text-forge-accent drop-shadow-[0_0_10px_var(--forge-accent)]" size={40} />
          </motion.div>
          
          <div>
            <h1 className="text-5xl font-orbitron font-bold mb-4 tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-forge-accent to-forge-text drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] uppercase">
              FORGE_OS
            </h1>
            <p className="text-forge-text-muted font-mono text-sm tracking-widest uppercase">
              Initializing Neural Subsystems...
            </p>
          </div>
          
          <div className="flex gap-3 justify-center mb-4">
            <div className="w-8 h-1 bg-forge-accent rounded shadow-[0_0_8px_var(--forge-accent)]" />
            <div className="w-2 h-1 bg-forge-surface-3 rounded" />
          </div>
          
          <NeonButton 
            variant="accent" 
            className="mx-auto text-lg px-8 py-4"
            onClick={() => setStep(1)}
          >
            BOOT SEQUENCE <Icon icon={ChevronRight} className="inline-block ml-2 -mt-0.5" />
          </NeonButton>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-forge-bg flex flex-col items-center justify-center p-8 text-forge-text relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-forge-accent via-forge-bg to-forge-bg" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full flex flex-col gap-6 relative z-10"
      >
        <div className="flex justify-between items-center w-full">
          <h2 className="text-2xl font-orbitron font-bold tracking-widest uppercase drop-shadow-[0_0_8px_var(--forge-text)]">Hardware Scan</h2>
          <div className="flex gap-2">
            <div className="w-2 h-1 rounded bg-forge-surface-3"></div>
            <div className="w-8 h-1 rounded bg-forge-accent shadow-[0_0_8px_var(--forge-accent)]"></div>
          </div>
        </div>
        
        <GlassPanel intensity="low" className="p-6 flex items-center gap-4 border-forge-accent/30">
          {hardware ? (
            <>
              <Icon icon={CheckCircle2} className="text-forge-success drop-shadow-[0_0_5px_var(--forge-success)]" />
              <div className="flex flex-col">
                <span className="font-mono text-forge-text font-bold uppercase tracking-wider">
                  {hardware.gpus ? hardware.gpus[0].name : hardware.name}
                </span>
                <span className="font-mono text-[10px] tracking-widest text-forge-text-muted uppercase">
                  {hardware.gpus ? `${hardware.gpus[0].vram_mb} MB VRAM ALLOCATED` : 'HARDWARE DETECTION COMPLETED'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="animate-spin w-5 h-5 border-2 border-forge-accent border-t-transparent rounded-full shadow-[0_0_10px_var(--forge-accent)]" />
              <span className="font-mono text-xs text-forge-accent tracking-widest uppercase animate-pulse">Running diagnostics via Rust backend...</span>
            </>
          )}
        </GlassPanel>

        <h2 className="text-xl font-orbitron font-bold mt-4 tracking-widest uppercase">Compute Engines</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Llama.cpp (Universal) */}
          <GlassPanel 
            onClick={() => toggleEngine('llama.cpp')}
            className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 ${selectedEngines.includes('llama.cpp') ? 'border-forge-accent shadow-[0_0_15px_var(--forge-accent-muted)]' : 'border-forge-border opacity-70 hover:opacity-100'}`}
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Icon icon={Terminal} size={16} className={selectedEngines.includes('llama.cpp') ? 'text-forge-accent' : 'text-forge-text-muted'} />
                <h3 className="font-mono font-bold text-sm tracking-widest uppercase text-forge-text">Llama.cpp</h3>
              </div>
              <p className="text-xs font-mono text-forge-text-muted">Universal CPU/GPU hybrid inference. Rock solid stability.</p>
            </div>
          </GlassPanel>

          {/* LMDeploy (Nvidia/AMD) */}
          <GlassPanel 
            onClick={() => toggleEngine('lmdeploy')}
            className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 ${selectedEngines.includes('lmdeploy') ? 'border-forge-accent shadow-[0_0_15px_var(--forge-accent-muted)]' : 'border-forge-border opacity-70 hover:opacity-100'}`}
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Icon icon={Zap} size={16} className={selectedEngines.includes('lmdeploy') ? 'text-forge-accent' : 'text-forge-text-muted'} />
                <h3 className="font-mono font-bold text-sm tracking-widest uppercase text-forge-text">LMDeploy</h3>
              </div>
              <p className="text-xs font-mono text-forge-text-muted">High-speed optimized serving for AWQ/W4A16 weights.</p>
            </div>
          </GlassPanel>

          {/* vLLM */}
          <GlassPanel 
            onClick={() => toggleEngine('vllm')}
            className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 ${selectedEngines.includes('vllm') ? 'border-forge-accent shadow-[0_0_15px_var(--forge-accent-muted)]' : 'border-forge-border opacity-70 hover:opacity-100'}`}
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Icon icon={Server} size={16} className={selectedEngines.includes('vllm') ? 'text-forge-accent' : 'text-forge-text-muted'} />
                <h3 className="font-mono font-bold text-sm tracking-widest uppercase text-forge-text">vLLM</h3>
              </div>
              <p className="text-xs font-mono text-forge-text-muted">High-throughput continuous batching server.</p>
            </div>
          </GlassPanel>

          {/* TensorRT-LLM (Hardware Gated) */}
          <div className="bg-forge-surface-2/30 border border-forge-border-subtle rounded-xl p-6 relative overflow-hidden opacity-40 cursor-not-allowed group col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={Cpu} size={16} className="text-forge-text-muted" />
              <h3 className="font-mono font-bold text-sm tracking-widest uppercase text-forge-text-muted">TensorRT-LLM</h3>
            </div>
            <p className="text-xs font-mono text-forge-text-muted">Maximum NVIDIA optimization.</p>
            <div className="absolute inset-0 bg-forge-bg/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] font-mono tracking-widest text-forge-warning bg-forge-warning/10 px-3 py-1 rounded border border-forge-warning/30">NVIDIA CUDA 8.0+ REQ</span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-forge-danger/10 text-forge-danger p-4 rounded-xl border border-forge-danger/30 text-xs font-mono tracking-wide flex items-center justify-between shadow-[0_0_10px_var(--forge-danger-muted)]">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="p-1 hover:text-white transition-colors">
              <Icon icon={X} size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-4">
          <NeonButton 
            variant="accent"
            onClick={finish}
            disabled={!hardware || selectedEngines.length === 0 || isInitializing}
            className="w-full py-4 text-sm tracking-widest"
          >
            {isInitializing ? (
              <><div className="animate-spin w-4 h-4 border-2 border-forge-bg border-t-transparent rounded-full mr-2 inline-block -mt-1" /> EXECUTING...</>
            ) : (
              `COMPILE SUBSYSTEMS (${selectedEngines.length})`
            )}
          </NeonButton>
          <button 
            onClick={skip}
            className="py-3 w-full rounded-lg text-forge-text-muted hover:text-forge-accent font-mono text-xs tracking-widest uppercase transition-colors"
          >
            Bypass Initialization
          </button>
        </div>
      </motion.div>
    </div>
  );
}
