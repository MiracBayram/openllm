import { useConfigStore } from '../store/configStore';
import { useInferenceStore } from '../store/inference';
import { useUiStore } from '../store/uiStore';
import { usePersonaStore } from '../store/personaStore';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Select } from './ui/Select';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToastStore } from '../store/toastStore';
import { ConfirmModal } from './ConfirmModal';

export function SettingsView() {
  const { config, updateConfig } = useConfigStore();
  const { config: infConfig, setConfig: setInfConfig } = useInferenceStore();
  
  const [hardwareProfile, setHardwareProfile] = useState<any>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isRegenerateModalOpen, setRegenerateModalOpen] = useState(false);
  
  const { addToast } = useToastStore();

  useEffect(() => {
    invoke('get_hardware_profile').then(setHardwareProfile).catch(console.error);
    invoke<string>('get_api_key').then(setApiKey).catch(console.error);
  }, []);

  const maxVram = hardwareProfile 
    ? hardwareProfile.gpus.reduce((acc: number, g: any) => acc + g.vram_mb, 0) * 1.2
    : 24576;

  if (!config) return null;

  return (
    <div className="flex-1 p-8 bg-forge-bg text-forge-text overflow-y-auto">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Settings</h1>
          <p className="text-forge-text/70">Manage Forge application preferences.</p>
        </div>

        <div className="bg-forge-surface/80 border border-forge-border rounded shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 flex flex-col gap-6 skeuo-bevel-in backdrop-blur-md">
          {/* Theme / Appearance */}
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-forge-text mb-2">Appearance</h3>
            <label className="font-semibold text-forge-text">Theme</label>
            <Select 
              value={usePersonaStore.getState().activePersonaId}
              onChange={(newTheme) => {
                usePersonaStore.getState().setActivePersona(newTheme as any);
                addToast({ type: 'success', title: 'Persona Applied', message: `Interface adapted to ${newTheme}` });
              }}
              options={[
                { value: "spectral_matrix", label: "Spectral Matrix (Default)" },
                { value: "neural_decay", label: "Neural Decay (Brutalist)" },
                { value: "kinetic_industrial", label: "Kinetic Industrial (Hard-Tech)" },
                { value: "solar_witch", label: "Solar Witch (Orange/Red)" }
              ]}
              className="w-full max-w-xs"
            />
            
            <div className="flex flex-col gap-2 mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useUiStore.getState().reduceMotion}
                  onChange={(e) => useUiStore.getState().setReduceMotion((e.target as HTMLInputElement).checked)}
                  className="w-4 h-4 accent-indigo-500 bg-forge-surface border-forge-border rounded"
                />
                <span className="text-sm font-semibold text-forge-text">Reduce Motion</span>
              </label>
              <p className="text-xs text-forge-text-muted ml-7">Devre dışı bırakıldığında CRT ekran kapanma, titreme ve yoğun animasyon efektleri kapatılır.</p>
            </div>
          </div>

          <hr className="border-forge-border" />

          {/* Storage & Models */}
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-forge-text mb-2">Storage</h3>
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-forge-text">Models Directory</label>
              <div className="flex gap-2 w-full max-w-md">
                <input 
                  type="text" 
                  readOnly 
                  value={config.storage.models_directory} 
                  className="bg-forge-bg border border-forge-border rounded-md p-2 text-sm text-forge-text-muted font-mono w-full cursor-not-allowed"
                />
                <button 
                  onClick={async () => {
                    const selected = await open({ directory: true, multiple: false });
                    if (selected && typeof selected === 'string') {
                      updateConfig({ storage: { ...config.storage, models_directory: selected } });
                      addToast({ type: 'success', title: 'Directory Saved', message: 'Models directory updated.' });
                    }
                  }}
                  className="bg-forge-surface hover:bg-forge-surface-3 text-forge-text px-4 rounded-md text-sm transition-colors border border-forge-border"
                >
                  Browse
                </button>
                <button 
                  onClick={() => {
                    if (config.storage.models_directory) {
                      // Attempt to open the directory using plugin-opener
                      // tauri plugin opener openUrl can open files/folders depending on platform, or use 'file://' 
                      // Wait, openUrl might expect a URL. We can just use openUrl('file://' + config.storage.models_directory)
                      openUrl('file://' + config.storage.models_directory).catch(console.error);
                    }
                  }}
                  className="bg-forge-surface hover:bg-forge-surface-3 text-forge-text px-4 rounded-md text-sm transition-colors border border-forge-border whitespace-nowrap"
                >
                  Klasörü Aç
                </button>
              </div>
              <p className="text-xs text-forge-text-muted mt-1">Default OS app data directory (XDG Base/Apple Sandbox compliant).</p>
            </div>
            
            <div className="flex flex-col gap-2 mt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.storage.auto_preload_last_model}
                  onChange={(e) => updateConfig({
                    storage: { ...config.storage, auto_preload_last_model: (e.target as HTMLInputElement).checked }
                  })}
                  className="w-4 h-4 accent-indigo-500 bg-forge-surface border-forge-border rounded"
                />
                <span className="text-sm text-forge-text">Auto-preload last used model</span>
              </label>
            </div>
          </div>

          <hr className="border-forge-border" />

          {/* Performance Limits */}
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-forge-text mb-2">Performance Limits</h3>
            <div className="flex flex-col gap-2 max-w-md">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-forge-text">VRAM Hard Limit</label>
                <span className="text-sm font-mono text-forge-accent">{config.hardware.vram_limit_mb} MB</span>
              </div>
              
              {/* Progress representation */}
              <div className="w-full bg-forge-surface-3 h-2 rounded-full overflow-hidden mt-1 mb-2">
                <div 
                  className="h-full bg-forge-accent transition-all duration-300" 
                  style={{ width: `${Math.min(100, Math.max(0, (config.hardware.vram_limit_mb / maxVram) * 100))}%` }}
                />
              </div>

              <input 
                type="range" 
                min="1024" 
                max={Math.max(maxVram, 24576)} 
                step="512" 
                value={config.hardware.vram_limit_mb}
                onChange={(e) => updateConfig({ hardware: { ...config.hardware, vram_limit_mb: parseInt((e.target as any).value) } })}
                className="cockpit-slider w-full" 
              />
              {config.hardware.vram_limit_mb > maxVram / 1.2 && (
                <div className="mt-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 p-3 rounded-lg flex gap-2 items-start">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>
                    <strong>VRAM Warning:</strong> Your set limit ({config.hardware.vram_limit_mb} MB) exceeds estimated physical VRAM (~{Math.round(maxVram / 1.2)} MB). This may cause heavy swapping or Out-Of-Memory (OOM) crashes during generation.
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex flex-col gap-2 max-w-md mt-4">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-forge-text">CPU Threads</label>
                <span className="text-sm font-mono text-forge-accent">{config.hardware.cpu_threads} Threads</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max={hardwareProfile ? hardwareProfile.cpu_cores * 2 : 32} 
                step="1" 
                value={config.hardware.cpu_threads}
                onChange={(e) => updateConfig({ hardware: { ...config.hardware, cpu_threads: parseInt((e.target as any).value) } })}
                className="cockpit-slider w-full" 
              />
            </div>
          </div>

          <hr className="border-forge-border" />

          {/* Advanced Engine Overrides */}
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-forge-text mb-2 text-forge-danger">Advanced Engine Flags</h3>
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-forge-text">Raw CLI Overrides (Allowlist enforced)</label>
              <textarea 
                value={infConfig.advanced_flags}
                onChange={(e) => setInfConfig({ advanced_flags: (e.target as any).value })}
                placeholder="--ctx-size 16384 -b 512"
                className="bg-forge-bg border border-forge-border rounded-md p-3 text-sm text-forge-text font-mono w-full min-h-[100px] outline-none focus:border-forge-accent/50 transition-colors"
              />
              <p className="text-xs text-forge-text-muted">Only safe flags (--ctx-size, --threads, -b, etc.) will be passed to the OS. Others will be sanitized.</p>
            </div>
          </div>

          <hr className="border-forge-border" />

          {/* Inference Behavior */}
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-forge-text mb-2">Inference Behavior</h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={infConfig.rag_strict_mode ?? true}
                  onChange={(e) => setInfConfig({ rag_strict_mode: (e.target as any).checked })}
                  className="w-4 h-4 accent-indigo-500 bg-forge-surface border-forge-border rounded" 
                />
                <span className="text-sm font-semibold text-forge-text">Strict RAG Mode</span>
              </label>
              <p className="text-xs text-forge-text-muted ml-7">If enabled, the model will strictly answer ONLY from the provided document context. If disabled, it can use its general knowledge alongside the document.</p>
            </div>
          </div>

          {/* Network / Axum */}
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-forge-text mb-2">Network (Zero-Trust)</h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.network.lan_server_enabled}
                  onChange={(e) => updateConfig({ network: { ...config.network, lan_server_enabled: (e.target as any).checked } })}
                  className="w-4 h-4 accent-indigo-500 bg-forge-surface border-forge-border rounded" 
                />
                <span className="text-sm text-forge-text">Allow LAN Access (Requires API Key)</span>
              </label>
              <p className="text-xs text-forge-text-muted ml-7">Opens port 1234 on your local network interface protected by ~/.forge/.api_key Bearer Token.</p>
            </div>
            
            <div className="flex flex-col gap-2 mt-4">
              <label className="font-semibold text-forge-text">LAN API Key</label>
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  readOnly
                  value={apiKey}
                  className="bg-forge-bg border border-forge-border rounded-md p-2 text-sm text-forge-text-muted font-mono flex-1"
                />
                <button onClick={() => setShowApiKey(!showApiKey)} className="bg-forge-surface hover:bg-forge-surface-3 text-forge-text px-3 py-2 text-sm transition-colors border border-forge-border rounded-md">
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
                <button onClick={() => setRegenerateModalOpen(true)} className="bg-forge-surface hover:bg-red-500/20 text-red-400 px-3 py-2 text-sm transition-colors border border-forge-border hover:border-red-500/50 rounded-md">
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isRegenerateModalOpen}
        title="Regenerate API Key?"
        description="Are you sure you want to regenerate your LAN API Key? Any external applications using the current key will be disconnected immediately."
        confirmText="Regenerate"
        isDanger={true}
        onConfirm={async () => {
          try {
            const newKey = await invoke<string>('regenerate_api_key');
            setApiKey(newKey);
            setRegenerateModalOpen(false);
            addToast({ type: 'success', title: 'API Key Regenerated', message: 'Your new LAN API Key is active.' });
          } catch(e: any) { 
            console.error(e);
            addToast({ type: 'error', title: 'Error', message: e.toString() });
          }
        }}
        onCancel={() => setRegenerateModalOpen(false)}
      />
    </div>
  );
}
