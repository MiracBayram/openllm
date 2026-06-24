import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  activeTab: 'chat' | 'hub' | 'server' | 'agents' | 'knowledge' | 'settings' | 'arena';
  setActiveTab: (tab: 'chat' | 'hub' | 'server' | 'agents' | 'knowledge' | 'settings' | 'arena') => void;
  inspectorOpen: boolean;
  toggleInspector: () => void;
  setInspectorOpen: (val: boolean) => void;
  onboardingComplete: boolean;
  setOnboardingComplete: (val: boolean) => void;
  systemPromptModalOpen: boolean;
  systemPromptAgentId: string | null;
  systemPromptAgentContent: string | null;
  setSystemPromptModalOpen: (val: boolean, agentId?: string, content?: string) => void;
  isOmnibarOpen: boolean;
  setOmnibarOpen: (val: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (val: boolean) => void;
  morphingTo: string | null;
  triggerMorphTransition: (personaId: string) => void;
  clearMorphing: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeTab: 'chat',
      setActiveTab: (tab) => set({ activeTab: tab }),
      inspectorOpen: true,
      toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
      setInspectorOpen: (val) => set({ inspectorOpen: val }),
      onboardingComplete: false,
      setOnboardingComplete: (val) => set({ onboardingComplete: val }),
      systemPromptModalOpen: false,
      systemPromptAgentId: null,
      systemPromptAgentContent: null,
      setSystemPromptModalOpen: (val, agentId, content) => set({ 
        systemPromptModalOpen: val, 
        systemPromptAgentId: agentId || null,
        systemPromptAgentContent: content || null
      }),
      isOmnibarOpen: false,
      setOmnibarOpen: (val) => set({ isOmnibarOpen: val }),
      reduceMotion: false,
      setReduceMotion: (val) => set({ reduceMotion: val }),
      morphingTo: null,
      triggerMorphTransition: (id) => set({ morphingTo: id }),
      clearMorphing: () => set({ morphingTo: null })
    }),
    {
      name: 'forge-ui-storage',
      partialize: (state) => ({
        activeTab: state.activeTab,
        inspectorOpen: state.inspectorOpen,
        onboardingComplete: state.onboardingComplete,
        reduceMotion: state.reduceMotion
      })
    }
  )
);
