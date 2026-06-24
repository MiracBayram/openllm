import { create } from 'zustand';

export interface DownloadState {
  progress: number;
  speed: string;
  status: string;
}

export interface DownloadStoreState {
  activeDownloads: Record<string, DownloadState>;
  setActiveDownloads: (updater: (prev: Record<string, DownloadState>) => Record<string, DownloadState>) => void;
  removeDownload: (dlKey: string) => void;
}

export const useDownloadStore = create<DownloadStoreState>((set) => ({
  activeDownloads: {},
  setActiveDownloads: (updater) => set((state) => ({ activeDownloads: updater(state.activeDownloads) })),
  removeDownload: (dlKey) => set((state) => {
    const next = { ...state.activeDownloads };
    delete next[dlKey];
    return { activeDownloads: next };
  }),
}));
