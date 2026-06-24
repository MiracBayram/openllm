import { create } from 'zustand';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  level: 'info' | 'error' | 'warn' | 'debug';
}

interface LogStore {
  logs: LogEntry[];
  isOpen: boolean;
  addLog: (message: string, level?: LogEntry['level']) => void;
  clearLogs: () => void;
  setIsOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
}

const MAX_LOGS = 500;

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  isOpen: false,
  
  addLog: (message, level = 'info') => set((state) => {
    const newEntry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      message,
      level
    };
    
    const newLogs = [...state.logs, newEntry];
    if (newLogs.length > MAX_LOGS) {
      newLogs.shift();
    }
    
    return { logs: newLogs };
  }),
  
  clearLogs: () => set({ logs: [] }),
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen }))
}));
