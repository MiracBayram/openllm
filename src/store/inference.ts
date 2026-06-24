import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface InferenceStore {
  text: string;
  stats: any | null;
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
  config: {
    modelPath: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    top_k: number;
    repeat_penalty: number;
    system_prompt: string;
    advanced_flags: string;
    ctx_size?: number;
    gpu_layers?: number;
    rag_strict_mode?: boolean;
  };
  setConfig: (partial: Partial<InferenceStore['config']>) => void;
  start: (modelPath: string, prompt: string) => Promise<void>;
  stop: () => Promise<void>;
  appendToken: (token: string) => void;
  setStats: (stats: any) => void;
  clear: () => void;
}

import { persist } from 'zustand/middleware';

export const useInferenceStore = create<InferenceStore>()(
  persist(
    (set, get) => ({
  text: "",
  stats: null,
  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),
  config: {
    modelPath: "",
    temperature: 0.7,
    max_tokens: 1024,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    system_prompt: "You are a helpful AI assistant. You answer truthfully and concisely.",
    advanced_flags: "",
    ctx_size: 4096,
    gpu_layers: 33,
    rag_strict_mode: true
  },
  setConfig: (partial) => set((state) => ({ config: { ...state.config, ...partial } })),
  start: async (modelPath, _prompt) => {
    try {
      const { config } = get();
      const targetModel = config.modelPath || modelPath;
      await invoke('start_inference', { 
        modelPath: targetModel, 
        params: { 
          temperature: config.temperature, 
          max_tokens: config.max_tokens, 
          top_p: config.top_p,
          top_k: config.top_k,
          repeat_penalty: config.repeat_penalty,
          advanced_flags: config.advanced_flags !== "" ? config.advanced_flags : undefined
        } 
      });
    } catch (e) {
      console.error(e);
    }
  },
  stop: async () => {
    await invoke('stop_inference');
  },
  appendToken: (token) => set((state) => ({ text: state.text + token })),
  setStats: (stats) => set({ stats }),
  clear: () => set({ text: "", stats: null }),
}),
{
  name: 'forge-inference-config',
  partialize: (state) => ({ config: state.config })
}
));
