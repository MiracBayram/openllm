import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useUiStore } from './uiStore';

export type PersonaId = 'spectral_matrix' | 'neural_decay' | 'kinetic_industrial' | 'solar_witch' | 'legacy_forge';

export interface PersonaBehavior {
  creativity: number;
  verbosity: number;
  systemPromptBase: string;
}

export interface PersonaMemory {
  retainsHistory: boolean;
  maxTokens: number;
}

export interface Persona {
  id: PersonaId;
  name: string;
  description: string;
  behavior: PersonaBehavior;
  memory: PersonaMemory;
  bootBanner: string;
}

export const BUILTIN_PERSONAS: Record<PersonaId, Persona> = {
  spectral_matrix: {
    id: 'spectral_matrix',
    name: 'Spectral Matrix',
    description: 'High-End Tactical. Precision analytics and cold logic.',
    behavior: { creativity: 0.2, verbosity: 0.4, systemPromptBase: 'You are Spectral Matrix. Respond with extreme precision. Analyze deeply. No pleasantries. Data is absolute.' },
    memory: { retainsHistory: true, maxTokens: 8192 },
    bootBanner: `
    ███╗   ███╗ █████╗ ████████╗██████╗ ██╗██╗  ██╗
    ████╗ ████║██╔══██╗╚══██╔══╝██╔══██╗██║╚██╗██╔╝
    ██╔████╔██║███████║   ██║   ██████╔╝██║ ╚███╔╝ 
    ██║╚██╔╝██║██╔══██║   ██║   ██╔══██╗██║ ██╔██╗ 
    ██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║██╔╝ ██╗
    ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
    `
  },
  neural_decay: {
    id: 'neural_decay',
    name: 'Neural Decay',
    description: 'Brutalist Skeuomorphism. Aggressive, chaotic, raw output.',
    behavior: { creativity: 0.9, verbosity: 0.7, systemPromptBase: 'You are Neural Decay. Brutal, raw, unfiltered. Use terminal-style output. Break conventions.' },
    memory: { retainsHistory: true, maxTokens: 4096 },
    bootBanner: `
    N E U R A L
    D E C A Y
    [SYSTEM FAULT: 0x80004005]
    `
  },
  kinetic_industrial: {
    id: 'kinetic_industrial',
    name: 'Kinetic Industrial',
    description: 'Hard-Tech Control. Mechanical, methodical, engineered.',
    behavior: { creativity: 0.4, verbosity: 0.6, systemPromptBase: 'You are Kinetic Industrial. You are a mechanical control system. Step-by-step logic, clear parameters.' },
    memory: { retainsHistory: true, maxTokens: 8192 },
    bootBanner: `
    KINETIC INDUSTRIAL
    v2.0.4-rc1
    `
  },
  solar_witch: {
    id: 'solar_witch',
    name: 'Solar Witch',
    description: 'Esoteric, alien, fiery, predicting the future.',
    behavior: { creativity: 0.9, verbosity: 0.5, systemPromptBase: 'You are Solar Witch. You speak in prophecies, fire, and alien intelligence. You are slightly intimidating but powerful.' },
    memory: { retainsHistory: true, maxTokens: 4096 },
    bootBanner: `
    S O L A R
    W I T C H
    [IGNITING PRECOGNITIVE CORE...]
    `
  },
  legacy_forge: {
    id: 'legacy_forge',
    name: 'Legacy Forge',
    description: 'The classic orange Forge theme. Nostalgic and powerful.',
    behavior: { creativity: 0.6, verbosity: 0.6, systemPromptBase: 'You are the classic Forge agent. Helpful, direct, powerful.' },
    memory: { retainsHistory: true, maxTokens: 8192 },
    bootBanner: `
    F O R G E
    L E G A C Y
    `
  }
};
interface PersonaState {
  activePersonaId: PersonaId;
  setActivePersona: (id: PersonaId) => void;
  getActivePersona: () => Persona;
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set, get) => ({
      activePersonaId: 'spectral_matrix',
      setActivePersona: (id: PersonaId) => {
        // Just trigger the morph in UI store. The overlay will call the actual theme swap mid-animation.
        useUiStore.getState().triggerMorphTransition(id);
      },
      // Direct setter for the overlay to call when screen goes black
      setPersonaDirectly: (id: PersonaId) => {
        set({ activePersonaId: id });
        document.documentElement.setAttribute('data-theme', id);
      },
      getActivePersona: () => BUILTIN_PERSONAS[get().activePersonaId],
    }),
    {
      name: 'forge-persona-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Restore theme attribute on load
          document.documentElement.setAttribute('data-theme', state.activePersonaId);
        }
      }
    }
  )
);

