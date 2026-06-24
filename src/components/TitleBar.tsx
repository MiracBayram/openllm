import {  Minus, Square, X, Hexagon  } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useConfigStore } from '../store/configStore';
import { platform } from '@tauri-apps/plugin-os';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

let cachedOs: 'macos' | 'windows' | 'linux' | null = null;

export function TitleBar() {
  const { config } = useConfigStore();
  const [os, setOs] = useState<'macos' | 'windows' | 'linux'>('linux');

  useEffect(() => {
    if (!cachedOs) {
      cachedOs = platform() as any;
    }
    if (cachedOs) setOs(cachedOs);
  }, []);

  const handleMinimize = () => invoke('window_minimize');
  const handleMaximize = () => invoke('window_maximize');
  const handleClose = async () => {
    try {
      await invoke('window_close');
    } catch (e) {
      console.error(e);
      await invoke('stop_inference');
      setTimeout(() => window.close(), 500);
    }
  };

  return (
    <div 
      className="h-10 bg-forge-bg border-b border-forge-border flex items-center justify-between shrink-0 select-none"
      data-tauri-drag-region
    >
      {/* Mac Traffic Lights */}
      {os === 'macos' && (
        <div className="flex items-center gap-2 px-4 h-full pointer-events-auto z-50">
          <button onClick={handleClose} className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] hover:brightness-110 active:brightness-90 transition-all group flex items-center justify-center">
            <Icon icon={X} size={8} className="opacity-0 group-hover:opacity-100 text-black/60" />
          </button>
          <button onClick={handleMinimize} className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] hover:brightness-110 active:brightness-90 transition-all group flex items-center justify-center">
            <Icon icon={Minus} size={8} className="opacity-0 group-hover:opacity-100 text-black/60" />
          </button>
          <button onClick={handleMaximize} className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] hover:brightness-110 active:brightness-90 transition-all group flex items-center justify-center">
            <Icon icon={Square} size={8} className="opacity-0 group-hover:opacity-100 text-black/60" />
          </button>
        </div>
      )}

      {/* Brand & Theme */}
      <div data-tauri-drag-region className={`flex items-center gap-3 h-full pointer-events-none z-50 ${os === 'macos' ? 'absolute left-1/2 -translate-x-1/2' : 'px-4'}`}>
        <div className="relative flex items-center justify-center">
          <Icon icon={Hexagon} size={16} className="text-forge-accent drop-shadow-[0_0_5px_var(--forge-accent)]" />
          <div className="absolute inset-0 bg-forge-accent mix-blend-screen opacity-20 animate-ping rounded-full" />
        </div>
        <span className="font-orbitron font-bold text-xs tracking-[0.2em] text-forge-text drop-shadow-[0_0_2px_var(--forge-text)]">FORGE_OS</span>
        {config?.ui?.theme && (
          <span className="text-[9px] text-forge-accent font-mono ml-2 border border-forge-accent/30 px-1.5 py-0.5 rounded bg-forge-accent/5 uppercase tracking-widest">
            [{config.ui.theme}]
          </span>
        )}
      </div>

      {/* Windows/Linux Controls */}
      {os !== 'macos' && (
        <div className="flex h-full pointer-events-auto z-50 ml-auto">
          <button 
            onClick={handleMinimize}
            className="w-12 h-full flex items-center justify-center text-forge-text-muted hover:bg-forge-surface-2 hover:text-forge-accent transition-colors relative"
          >
            <Icon icon={Minus} size={16} />
          </button>
          <button 
            onClick={handleMaximize}
            className="w-12 h-full flex items-center justify-center text-forge-text-muted hover:bg-forge-surface-2 hover:text-forge-accent transition-colors relative"
          >
            <Icon icon={Square} size={14} />
          </button>
          <button 
            onClick={handleClose}
            className="w-12 h-full flex items-center justify-center text-forge-text-muted hover:bg-forge-danger hover:text-forge-text transition-colors relative"
          >
            <Icon icon={X} size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
