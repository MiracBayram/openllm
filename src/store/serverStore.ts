import { create } from 'zustand';

interface ServerState {
  requestCount: number;
  startTime: number | null;
  engineLogs: string[];
  incrementRequests: () => void;
  setStartTime: (time: number | null) => void;
  addEngineLog: (log: string) => void;
  clearEngineLogs: () => void;
}

export const useServerStore = create<ServerState>((set) => ({
  requestCount: 0,
  startTime: null,
  engineLogs: [],
  incrementRequests: () => set((state) => ({ requestCount: state.requestCount + 1 })),
  setStartTime: (time) => set({ startTime: time, requestCount: 0 }),
  addEngineLog: (log) => set((state) => {
    const newLogs = [...state.engineLogs, log];
    if (newLogs.length > 500) {
      newLogs.splice(0, newLogs.length - 500);
    }
    return { engineLogs: newLogs };
  }),
  clearEngineLogs: () => set({ engineLogs: [] }),
}));
