import { create } from 'zustand';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';

let store: any;
export interface AppConfig {
  ui: {
    theme: string;
    sidebar_collapsed: boolean;
  };
  hardware: {
    vram_limit_mb: number;
    cpu_threads: number;
  };
  storage: {
    models_directory: string;
    auto_preload_last_model: boolean;
  };
  network: {
    lan_server_enabled: boolean;
    api_key_uuid: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  ui: {
    theme: 'dracula',
    sidebar_collapsed: false,
  },
  hardware: {
    vram_limit_mb: 8192,
    cpu_threads: 8,
  },
  storage: {
    models_directory: '', // Resolved at runtime
    auto_preload_last_model: true,
  },
  network: {
    lan_server_enabled: false,
    api_key_uuid: '',
  },
};

interface ConfigState {
  config: AppConfig | null;
  isLoaded: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  isLoaded: false,
  
  loadConfig: async () => {
    try {
      if (!store) {
        store = await load('.forge_config.json', { autoSave: false } as any);
      }
      const keys = await store.keys();
      if (keys.length === 0) {
        // Resolve cross-platform default dir
        let modelsDir = '';
        try {
          modelsDir = await invoke<string>('get_models_dir');
        } catch(e) {
          console.warn('Failed to resolve models dir from rust', e);
        }

        let apiKey = '';
        try {
          apiKey = await invoke<string>('get_api_key');
        } catch(e) {
          console.warn('Failed to resolve api key from rust', e);
        }

        const initialConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;
        initialConfig.storage.models_directory = modelsDir;
        initialConfig.network.api_key_uuid = apiKey;

        // Initialize with default config
        for (const [key, value] of Object.entries(initialConfig) as [keyof AppConfig, any][]) {
          await store.set(key, value);
        }
        await store.save();
        set({ config: initialConfig, isLoaded: true });
        
        // Apply initial theme
        document.documentElement.setAttribute('data-theme', DEFAULT_CONFIG.ui.theme);
      } else {
        const ui = await store.get('ui') as any || DEFAULT_CONFIG.ui;
        const hardware = await store.get('hardware') as any || DEFAULT_CONFIG.hardware;
        const storage = await store.get('storage') as any || DEFAULT_CONFIG.storage;
        const network = await store.get('network') as any || DEFAULT_CONFIG.network;

        // Ensure api key is always fresh from backend in case it changed or was missing
        try {
          network.api_key_uuid = await invoke<string>('get_api_key');
          await store.set('network', network);
          await store.save();
        } catch(e) {
          console.warn('Failed to sync api key from rust', e);
        }
        
        const loadedConfig = { ui, hardware, storage, network };
        set({ config: loadedConfig, isLoaded: true });
        
        document.documentElement.setAttribute('data-theme', loadedConfig.ui.theme);
      }
    } catch (error) {
      console.error('Failed to load config', error);
      set({ config: DEFAULT_CONFIG, isLoaded: true });
    }
  },

  updateConfig: async (partial: Partial<AppConfig>) => {
    // 1. Optimistic UI update (Synchronous)
    let newConfig: AppConfig | undefined;
    set((state) => {
      if (!state.config) return state;
      newConfig = {
        ui: partial.ui ? { ...state.config.ui, ...partial.ui } : state.config.ui,
        hardware: partial.hardware ? { ...state.config.hardware, ...partial.hardware } : state.config.hardware,
        storage: partial.storage ? { ...state.config.storage, ...partial.storage } : state.config.storage,
        network: partial.network ? { ...state.config.network, ...partial.network } : state.config.network,
      };
      
      // Check if theme changed
      if (partial.ui?.theme) {
        document.documentElement.setAttribute('data-theme', partial.ui.theme);
      }
      
      return { config: newConfig };
    });

    // 2. Async disk save
    if (newConfig) {
      if (partial.ui) await store.set('ui', newConfig.ui);
      if (partial.hardware) await store.set('hardware', newConfig.hardware);
      if (partial.storage) await store.set('storage', newConfig.storage);
      if (partial.network) await store.set('network', newConfig.network);
      await store.save();
    }
  }
}));
