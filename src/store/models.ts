import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ModelInfo {
  path: string;
  name: string;
  size_mb: number;
  quant_label: string;
  architecture: string;
  layer_count: number;
  embedding_length: number;
  chat_template: string | null;
  attention_head_count: number;
}

interface ModelsStore {
  models: ModelInfo[];
  loading: boolean;
  scanModels: (dir: string) => Promise<void>;
}

export const useModelsStore = create<ModelsStore>((set) => ({
  models: [],
  loading: false,
  scanModels: async (_dir: string) => {
    try {
      set({ loading: true });
      const models = await invoke<ModelInfo[]>('list_models');
      set({ models, loading: false });
    } catch (e) {
      console.error(e);
      set({ loading: false });
    }
  },
}));
