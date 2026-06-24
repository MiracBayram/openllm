import { create } from 'zustand';
import { useTauriEvent } from '../hooks/useTauriEvent';

interface TelemetryState {
  tps: number;
  updateStats: (payload: { tps: number }) => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  tps: 0,
  updateStats: (payload) => set({ 
    tps: payload.tps
  }),
}));

export function useTelemetryHUD() {
  const tps = useTelemetryStore((state) => state.tps);

  useTauriEvent<{tokens_per_sec: number}>('forge://stats', (event) => {
    const tps = event.tokens_per_sec;
    useTelemetryStore.getState().updateStats({ 
      tps: parseFloat(tps.toFixed(2))
    });
  });

  return { tps };
}
