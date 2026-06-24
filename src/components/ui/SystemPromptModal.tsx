import { useState, useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useInferenceStore } from '../../store/inference';
import { Icon } from './Icon';
import { FileText, X, Check, RefreshCw } from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';

export function SystemPromptModal() {
  const { systemPromptModalOpen, setSystemPromptModalOpen, systemPromptAgentId, systemPromptAgentContent } = useUiStore();
  const { config, setConfig } = useInferenceStore();
  const [prompt, setPrompt] = useState(config.system_prompt || '');

  useEffect(() => {
    if (systemPromptModalOpen) {
      if (systemPromptAgentId) {
        setPrompt(systemPromptAgentContent || '');
      } else {
        setPrompt(config.system_prompt || '');
      }
    }
  }, [systemPromptModalOpen, config.system_prompt, systemPromptAgentId, systemPromptAgentContent]);

  if (!systemPromptModalOpen) return null;

  const handleSave = async () => {
    if (systemPromptAgentId) {
      try {
        await invoke('update_agent', { id: systemPromptAgentId, systemPrompt: prompt });
        window.dispatchEvent(new Event('agent-updated'));
      } catch (e) {
        console.error(e);
      }
    } else {
      setConfig({ system_prompt: prompt });
    }
    setSystemPromptModalOpen(false);
  };

  const handleReset = () => {
    setPrompt("You are a helpful AI assistant. You answer truthfully and concisely.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-forge-bg border border-forge-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-forge-border bg-forge-surface/30">
          <div className="flex items-center gap-3 text-forge-text font-semibold">
            <div className="p-2 bg-forge-accent/10 rounded-lg text-forge-accent">
              <Icon icon={FileText} size={18} />
            </div>
            {systemPromptAgentId ? `System Prompt (Agent: ${systemPromptAgentId})` : 'System Prompt (Global)'}
          </div>
          <button 
            onClick={() => setSystemPromptModalOpen(false)}
            className="text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-2 p-1.5 rounded-lg transition-colors"
          >
            <Icon icon={X} size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-forge-text-muted">
            Bu metin, modelin davranışını ve kişiliğini belirler. Büyük modeller karmaşık sistem promptlarını anlayabilirken, küçük modeller için basit tutmanız önerilir.
          </p>
          
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
              className="w-full bg-forge-surface border border-forge-border rounded-xl p-4 text-forge-text font-mono text-sm resize-y focus:outline-none focus:border-forge-accent/50 focus:ring-1 focus:ring-forge-accent/50 transition-all custom-scrollbar"
              rows={8}
              placeholder="Sistem promptunuzu buraya girin..."
            />
            <div className="absolute bottom-3 right-4 text-[10px] text-forge-text-muted font-mono bg-forge-surface px-2 py-1 rounded">
              {prompt.length} karakter
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-forge-border bg-forge-surface/30">
          <button 
            onClick={handleReset}
            className="text-sm font-medium text-forge-text-muted hover:text-forge-text flex items-center gap-2 transition-colors"
          >
            <Icon icon={RefreshCw} size={14} />
            Varsayılana Dön
          </button>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSystemPromptModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-forge-text hover:bg-forge-surface transition-colors"
            >
              İptal
            </button>
            <button 
              onClick={handleSave}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-forge-accent text-white hover:bg-forge-accent-hover transition-colors shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center gap-2"
            >
              <Icon icon={Check} size={16} />
              Kaydet
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
