import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface HardwareProfile {
  cpu: {
    brand: string;
    physical_cores: number;
    logical_cores: number;
    base_freq_mhz: number;
    features: any;
  };
  memory: {
    total_mb: number;
    available_mb: number;
  };
  gpus: Array<{
    name: string;
    vram_mb: number;
    vram_available_mb: number;
  }>;
}

interface HardwareStore {
  profile: HardwareProfile | null;
  loading: boolean;
  fetchProfile: () => Promise<void>;
}

export const useHardwareStore = create<HardwareStore>((set) => ({
  profile: null,
  loading: false,
  fetchProfile: async () => {
    try {
      set({ loading: true });
      const profile = await invoke<HardwareProfile>('get_hardware_profile');
      set({ profile, loading: false });
    } catch (e) {
      console.error('Failed to get hardware profile', e);
      set({ loading: false });
    }
  },
}));
