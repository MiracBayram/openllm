import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useMicroInteractions } from './hooks/useMicroInteractions';
import { HardwareHUD } from './components/HardwareHUD';
import { PersonaMorphOverlay } from './components/ui/PersonaMorphOverlay';
import { ChatView } from './components/ChatView';
import { ArenaView } from './components/ArenaView';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { RightInspector } from './components/RightInspector';
import { HubView } from './components/HubView';
import { ServerView } from './components/ServerView';
import { SettingsView } from './components/SettingsView';
import { AgentsView } from './components/AgentsView';
import { KnowledgeView } from './components/KnowledgeView';
import { OnboardingWizard } from './components/OnboardingWizard';
import { Omnibar } from './components/Omnibar';
import { useUiStore } from './store/uiStore';
import { useConfigStore } from './store/configStore';
import { useServerStore } from './store/serverStore';
import { useChatStore } from './store/chatStore';
import { useDownloadStore } from './store/downloadStore';
import { useModelsStore } from './store/models';
import { useTauriEvent } from './hooks/useTauriEvent';
import { ToastContainer } from './components/ToastContainer';
import { SystemPromptModal } from './components/ui/SystemPromptModal';
import { LogViewer } from './components/LogViewer';
import { StatusBar } from './components/StatusBar';
import { usePersonaStore } from './store/personaStore';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useOperatorTempo } from './hooks/useOperatorTempo';
import { useHardwareLerp } from './hooks/useHardwareLerp';
import { useHardwareStore } from './store/hardware';
import './App.css';

function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const onboardingComplete = useUiStore((s) => s.onboardingComplete);
  const isLoaded = useConfigStore((s) => s.isLoaded);
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const config = useConfigStore((s) => s.config);
  const { playProceduralSound } = useAudioEngine();
  useOperatorTempo();
  
  const { vramUsedMb } = useHardwareLerp();
  const { profile } = useHardwareStore();
  const maxVram = profile?.gpus?.[0]?.vram_mb || 24000;
  const isVramCritical = (vramUsedMb / maxVram) > 0.95;

  useEffect(() => {
    if (isVramCritical) {
      playProceduralSound('oom_klaxon');
    }
  }, [isVramCritical, playProceduralSound]);
  useEffect(() => {
    if (config?.ui?.theme) {
      document.documentElement.setAttribute('data-theme', config.ui.theme);
    }
  }, [config?.ui?.theme]);

  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const addEngineLog = useServerStore((s) => s.addEngineLog);

  useTauriEvent('engine-log', (payload: any) => {
    addEngineLog(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });

  const setActiveDownloads = useDownloadStore(s => s.setActiveDownloads);
  const scanModels = useModelsStore(s => s.scanModels);

  useTauriEvent<any>('forge://download::progress', (payload) => {
    const percent = payload.total_bytes > 0 
      ? Math.round((payload.downloaded_bytes / payload.total_bytes) * 100) 
      : 0;
    
    let speedText = '';
    if (payload.speed_bps > 0) {
      speedText = `${(payload.speed_bps / 1024 / 1024).toFixed(1)} MB/s`;
    }

    let statusMsg = payload.status;
    if (typeof statusMsg === 'object' && statusMsg.Error) {
      statusMsg = 'Error: ' + statusMsg.Error;
    }

    if (statusMsg === 'Completed') {
      if (config?.storage.models_directory) {
        scanModels(config.storage.models_directory);
      }
      import('./store/toastStore').then(({ useToastStore }) => {
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Download Complete',
          message: `Model ${payload.model_id} downloaded successfully.`
        });
      });
    }

    const dlKey = `${payload.model_id}::${payload.file_name || ''}`;

    setActiveDownloads(prev => ({
      ...prev,
      [dlKey]: {
        progress: percent,
        speed: speedText,
        status: statusMsg
      }
    }));
  });

  useEffect(() => {
    loadConfig();
    useChatStore.getState().loadFromDb();

    // Red Flag 4: Tauri Graceful Shutdown
    const unlistenPromise = getCurrentWindow().onCloseRequested(async (event) => {
      // Prevent immediate close
      event.preventDefault();
      setIsShuttingDown(true);
      
      try {
        await invoke('stop_inference'); // Send signal to kill engine
        // Add artificial delay for UX to show the shutdown screen
        setTimeout(async () => {
          await getCurrentWindow().destroy();
        }, 800);
      } catch (e) {
        await getCurrentWindow().destroy();
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [loadConfig]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey) {
          // Persona Morphing Shortcuts
          const personaIds = ['spectral_matrix', 'neural_decay', 'kinetic_industrial', 'solar_witch'] as const;
          const switchPersona = (index: number) => {
            const id = personaIds[index];
            if (id && id !== usePersonaStore.getState().activePersonaId) {
              usePersonaStore.getState().setActivePersona(id as any);
              playProceduralSound('morph');
            }
          };
          switch (e.code) {
            case 'Digit1': e.preventDefault(); switchPersona(0); break;
            case 'Digit2': e.preventDefault(); switchPersona(1); break;
            case 'Digit3': e.preventDefault(); switchPersona(2); break;
            case 'Digit4': e.preventDefault(); switchPersona(3); break;
          }
        } else {
          // Tab Navigation Shortcuts
          switch (e.code) {
            case 'Digit1': e.preventDefault(); useUiStore.getState().setActiveTab('chat'); break;
            case 'Digit2': e.preventDefault(); useUiStore.getState().setActiveTab('hub'); break;
            case 'Digit3': e.preventDefault(); useUiStore.getState().setActiveTab('arena'); break;
            case 'Digit4': e.preventDefault(); useUiStore.getState().setActiveTab('knowledge'); break;
            case 'Digit5': e.preventDefault(); useUiStore.getState().setActiveTab('agents'); break;
            case 'Digit6': e.preventDefault(); useUiStore.getState().setActiveTab('server'); break;
            case 'Digit7': e.preventDefault(); useUiStore.getState().setActiveTab('settings'); break;
            case 'KeyK': e.preventDefault(); useUiStore.getState().setOmnibarOpen(!useUiStore.getState().isOmnibarOpen); break;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isShuttingDown) {
    return (
      <div className="flex flex-col w-screen h-screen items-center justify-center bg-forge-bg text-forge-text font-sans">
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
          <div className="w-12 h-12 rounded-full border-t-2 border-forge-accent animate-spin" />
          <h2 className="text-xl font-medium tracking-tight">Shutting down engine...</h2>
          <p className="text-sm text-forge-text-muted">Safely flushing memory</p>
        </div>
      </div>
    );
  }

  if (!onboardingComplete) {
    return (
      <div className="flex flex-col w-screen h-screen overflow-hidden font-sans select-none">
        <TitleBar />
        <div className="flex flex-1 min-h-0 relative">
          <OnboardingWizard />
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="flex w-screen h-screen items-center justify-center bg-forge-bg text-forge-text">Yükleniyor...</div>;
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-forge-bg text-forge-text overflow-hidden font-sans selection:bg-forge-accent/30 relative">
      {isVramCritical && (
        <div className="pointer-events-none absolute inset-0 z-50 mix-blend-multiply shadow-[inset_0_0_150px_rgba(239,68,68,0.4)] border-4 border-red-500/50 animate-pulse" />
      )}
      <PersonaMorphOverlay />
      <TitleBar />
      <div className="flex flex-1 min-h-0 relative">
        <Sidebar />
        
        <main className="flex-1 flex flex-col relative h-full bg-forge-bg">
          {activeTab === 'server' && <HardwareHUD />}
          
          <div className="flex-1 relative overflow-hidden flex">
            <div className={activeTab === 'chat' ? 'contents' : 'hidden'}><ChatView /></div>
            <div className={activeTab === 'arena' ? 'contents' : 'hidden'}><ArenaView /></div>
            <div className={activeTab === 'agents' ? 'contents' : 'hidden'}><AgentsView /></div>
            <div className={activeTab === 'hub' ? 'contents' : 'hidden'}><HubView /></div>
            <div className={activeTab === 'server' ? 'contents' : 'hidden'}><ServerView /></div>
            <div className={activeTab === 'settings' ? 'contents' : 'hidden'}><SettingsView /></div>
            <div className={activeTab === 'knowledge' ? 'contents' : 'hidden'}><KnowledgeView /></div>
            
            {/* Dynamic Right Sidebar based on Active Tab */}
            {activeTab === 'chat' && <RightInspector />}
          </div>
        </main>
      </div>
      
      <LogViewer />
      <ToastContainer />
      <SystemPromptModal />
      <Omnibar />
      <StatusBar />
    </div>
  );
}

export default App;
