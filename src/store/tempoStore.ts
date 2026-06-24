import { create } from 'zustand';

interface TempoState {
  tempoFactor: number;
  setTempoFactor: (val: number) => void;
}

export const useTempoStore = create<TempoState>((set) => ({
  tempoFactor: 0.5,
  setTempoFactor: (val) => set({ tempoFactor: val })
}));
