import { MessageSquare, Server, Download, Settings, PanelRightOpen, PanelRightClose, Bot, Database, Terminal, Users } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useUiStore } from '../store/uiStore';
import { useLogStore } from '../store/logStore';
import { useMicroInteractions } from '../hooks/useMicroInteractions';
import { motion, AnimatePresence } from 'framer-motion';

export function Sidebar() {
  const { activeTab, setActiveTab, toggleInspector, inspectorOpen } = useUiStore();
  const { playClickSound } = useMicroInteractions();

  const tabs = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'arena', icon: Users, label: 'Arena' },
    { id: 'agents', icon: Bot, label: 'Agents' },
    { id: 'knowledge', icon: Database, label: 'Knowledge Base' },
    { id: 'hub', icon: Download, label: 'Hub' },
    { id: 'server', icon: Server, label: 'Server' },
    { id: 'settings', icon: Settings, label: 'Settings' }
  ] as const;

  return (
    <div className="w-16 bg-forge-bg border-r border-forge-border flex flex-col py-6 px-2 gap-4 z-40 shrink-0">
      <div className="flex flex-col gap-2 flex-1">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            tabIndex={0}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              playClickSound();
              setActiveTab(tab.id);
            }}
            className={`flex items-center justify-center p-3 rounded-lg transition-colors group relative w-full focus:outline-none focus:ring-2 focus:ring-forge-accent/50 ${
              activeTab === tab.id 
                ? 'text-forge-accent bg-forge-accent/10 shadow-[0_0_15px_var(--forge-accent-muted)]' 
                : 'text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-2 hover:shadow-[0_0_10px_var(--forge-surface-2)]'
            }`}
          >
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTabIndicator"
                className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-forge-accent rounded-r-full shadow-[0_0_10px_var(--forge-accent)]" 
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <Icon icon={tab.icon} size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} className={`shrink-0 ${activeTab === tab.id ? 'drop-shadow-[0_0_8px_var(--forge-accent)]' : ''}`} />
            
            {/* Tooltip */}
            <div className="absolute left-full ml-3 px-2 py-1 bg-forge-surface-3 border border-forge-border text-forge-accent text-xs font-mono font-semibold rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 tracking-widest uppercase">
              {tab.label}
            </div>
          </motion.button>
        ))}
      </div>

      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          playClickSound();
          useLogStore.getState().toggleOpen();
        }}
        className="flex items-center justify-center p-3 rounded-lg transition-colors group relative mt-auto focus:outline-none focus:ring-2 focus:ring-forge-accent/50 text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-2"
      >
        <Icon icon={Terminal} size={20} strokeWidth={2} />
        <div className="absolute left-full ml-3 px-2 py-1 bg-forge-surface-3 border border-forge-border text-forge-accent text-xs font-mono font-semibold rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 uppercase tracking-widest">
          Terminal Logs
        </div>
      </motion.button>

      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          playClickSound();
          toggleInspector();
        }}
        tabIndex={0}
        aria-label={inspectorOpen ? "Close Inspector" : "Open Inspector"}
        className={`flex items-center justify-center p-3 rounded-lg transition-colors group relative mt-auto focus:outline-none focus:ring-2 focus:ring-forge-accent/50 ${
          inspectorOpen ? 'text-forge-accent bg-forge-accent/10 shadow-[0_0_15px_var(--forge-accent-muted)]' : 'text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-2'
        }`}
      >
        <Icon icon={inspectorOpen ? PanelRightClose : PanelRightOpen} size={20} strokeWidth={2} className={inspectorOpen ? 'drop-shadow-[0_0_8px_var(--forge-accent)]' : ''} />
        <div className="absolute left-full ml-3 px-2 py-1 bg-forge-surface-3 border border-forge-border text-forge-accent text-xs font-mono font-semibold rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 uppercase tracking-widest">
          {inspectorOpen ? 'Close Inspector' : 'Open Inspector'}
        </div>
      </motion.button>
    </div>
  );
}
