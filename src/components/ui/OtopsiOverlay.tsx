import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity } from 'lucide-react';

interface TensorScanEvent {
  bytes: number[];
  entropy: number;
  block_index: number;
}

export function OtopsiOverlay({ modelPath, onClose }: { modelPath: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [entropy, setEntropy] = useState(0);
  const [block, setBlock] = useState(0);

  useEffect(() => {
    let intervalId: any;
    
    const startSession = async () => {
      try {
        await invoke('start_autopsy', { modelPath });
        setActive(true);
        
        intervalId = setInterval(async () => {
          try {
            const data: TensorScanEvent = await invoke('sample_autopsy');
            setEntropy(data.entropy);
            setBlock(data.block_index);
            drawBytes(data.bytes);
          } catch (e) {
            console.error("Autopsy sample failed:", e);
          }
        }, 100); // 10 FPS to reduce GPU load
      } catch (e) {
        console.error("Failed to start autopsy:", e);
      }
    };

    startSession();

    return () => {
      if (intervalId) clearInterval(intervalId);
      // Wait for cleanup to avoid locking files
      invoke('stop_autopsy').catch(console.error);
    };
  }, [modelPath]);

  const cssCacheRef = useRef<{r: number, g: number, b: number} | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getAccentColor = () => {
    if (cssCacheRef.current) return cssCacheRef.current;
    const style = getComputedStyle(document.documentElement);
    const accentColor = style.getPropertyValue('--forge-accent').trim() || '#00E5FF';
    let r = 0, g = 229, b = 255;
    if (accentColor.startsWith('#') && accentColor.length === 7) {
      r = parseInt(accentColor.slice(1, 3), 16);
      g = parseInt(accentColor.slice(3, 5), 16);
      b = parseInt(accentColor.slice(5, 7), 16);
    }
    cssCacheRef.current = { r, g, b };
    return cssCacheRef.current;
  };

  const drawBytes = (bytes: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    
    const cols = 128;
    const rows = 64;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(10, 10, 15, 0.15)'; 
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';

    const { r, g, b } = getAccentColor();

    let offscreen = offscreenCanvasRef.current;
    if (!offscreen) {
      offscreen = document.createElement('canvas');
      offscreen.width = cols;
      offscreen.height = rows;
      offscreenCanvasRef.current = offscreen;
    }
    
    const offCtx = offscreen.getContext('2d')!;
    const imgData = offCtx.createImageData(cols, rows);
    
    for (let i = 0; i < bytes.length; i++) {
      const val = bytes[i];
      if (val < 10) continue; // skip dark
      
      const idx = i * 4;
      imgData.data[idx] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = val; // alpha channel mapped to tensor value
    }
    
    offCtx.putImageData(imgData, 0, 0);
    
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, w, h);
    
    ctx.globalCompositeOperation = 'source-over';
    const scanlineY = (Date.now() / 8) % h;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.1)`;
    ctx.fillRect(0, scanlineY, w, 4);
    
    if (Math.random() > 0.8) {
      ctx.fillStyle = `rgba(255, 255, 255, 0.05)`;
      ctx.fillRect(0, Math.random() * h, w, 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-full max-w-6xl flex flex-col gap-4">
        
        <div className="flex items-center justify-between font-mono text-forge-accent">
          <div className="flex items-center gap-3">
            <Activity className="animate-pulse shadow-[0_0_10px_currentColor] rounded-full" />
            <h2 className="text-xl tracking-[0.2em] uppercase font-bold text-shadow-glow">Live Tensor Autopsy</h2>
            {active && <span className="text-[10px] bg-forge-accent/20 px-2 py-0.5 rounded text-forge-accent ml-4 animate-pulse">STREAMING</span>}
          </div>
          <button 
            onClick={onClose}
            className="hover:text-white transition-colors uppercase text-sm tracking-widest border border-forge-accent/30 px-4 py-1 rounded"
          >
            Close Scan
          </button>
        </div>

        <div className="flex gap-4">
          <div className="w-48 flex flex-col gap-4 text-xs font-mono text-forge-text-secondary">
            <div className="p-3 border border-forge-border bg-forge-surface-2/50 rounded flex flex-col gap-1">
              <span className="text-forge-text-muted">TARGET</span>
              <span className="text-forge-text break-all">{modelPath.split(/[\\/]/).pop()}</span>
            </div>
            
            <div className="p-3 border border-forge-border bg-forge-surface-2/50 rounded flex flex-col gap-1">
              <span className="text-forge-text-muted">BLOCK INDEX</span>
              <span className="text-forge-accent text-lg">{block.toString().padStart(8, '0')}</span>
            </div>

            <div className="p-3 border border-forge-border bg-forge-surface-2/50 rounded flex flex-col gap-1">
              <span className="text-forge-text-muted">ENTROPY / DENSITY</span>
              <span className="text-forge-warning text-lg">{(entropy * 100).toFixed(1)}%</span>
              <div className="w-full h-1 bg-black rounded mt-1 overflow-hidden">
                <div className="h-full bg-forge-warning transition-all" style={{ width: `${entropy * 100}%` }} />
              </div>
            </div>

            <div className="mt-auto p-3 text-[10px] text-forge-text-muted border border-red-500/30 bg-red-500/5 rounded">
              <span className="text-red-400 font-bold block mb-1">WARNING</span>
              Direct memory mapping (mmap) bypasses safety checks. Scanning high-entropy tensor regions may cause UI lag or visual artifacting.
            </div>
          </div>

          <div className="flex-1 bg-[#0a0a0a] rounded border border-forge-border relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            {/* 1024x512 canvas for high resolution density map */}
            <canvas 
              ref={canvasRef} 
              width={1024} 
              height={512} 
              className="w-full h-full object-fill mix-blend-screen"
            />
            {/* Reticle / HUD Elements over the canvas */}
            <div className="absolute top-4 left-4 border-l-2 border-t-2 border-forge-accent/50 w-8 h-8 pointer-events-none" />
            <div className="absolute bottom-4 right-4 border-r-2 border-b-2 border-forge-accent/50 w-8 h-8 pointer-events-none" />
          </div>
        </div>
        
      </div>
    </div>
  );
}
