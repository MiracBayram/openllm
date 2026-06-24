import { useEffect, useState, useRef, useMemo } from 'react';
import Fuse from 'fuse.js';
import { useUiStore } from '../store/uiStore';
import { useChatStore } from '../store/chatStore';
import { invoke } from '@tauri-apps/api/core';
import { Search, MessageSquare, Settings, Server, Trash2, Power, Bot, Cpu } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useModelsStore } from '../store/models';
import { useInferenceStore } from '../store/inference';
import { motion, AnimatePresence } from 'framer-motion';
import { useMicroInteractions } from '../hooks/useMicroInteractions';

interface Agent {
  id: string;
  name: string;
  system_prompt: string;
}

export function Omnibar() {
  const { isOmnibarOpen, setOmnibarOpen, setActiveTab } = useUiStore();
  const clearMessages = useChatStore(s => s.clearMessages);
  const createThread = useChatStore(s => s.createThread);
  const { models } = useModelsStore();
  const { setConfig } = useInferenceStore();
  const { playClickSound, playTokenSound } = useMicroInteractions();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOmnibarOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      invoke<Agent[]>('get_agents').then(setAgents).catch(console.error);
    }
  }, [isOmnibarOpen]);

  if (!isOmnibarOpen) return null;

  const dynamicCommands = useMemo(() => {
    const baseCommands = [
      {
        id: 'nav-chat',
        title: 'Go to Chat',
        asciiIcon: '[>]',
        keywords: ['talk', 'conversation', 'message', 'home', 'main'],
        action: () => setActiveTab('chat')
      },
      {
        id: 'nav-server',
        title: 'Go to Server',
        asciiIcon: '[~]',
        keywords: ['hardware', 'telemetry', 'hud', 'backend'],
        action: () => setActiveTab('server')
      },
      {
        id: 'nav-settings',
        title: 'Go to Settings',
        asciiIcon: '[*]',
        keywords: ['config', 'preferences', 'theme', 'persona', 'reduce motion'],
        action: () => setActiveTab('settings')
      },
      {
        id: 'action-clear-chat',
        title: 'Clear Chat History',
        asciiIcon: '[!]',
        danger: true,
        keywords: ['delete', 'remove', 'wipe', 'reset', 'forget'],
        action: () => clearMessages()
      },
      {
        id: 'action-kill-engine',
        title: 'Kill Inference Engine',
        asciiIcon: '[X]',
        danger: true,
        keywords: ['stop', 'halt', 'quit', 'exit', 'shutdown', 'terminate'],
        action: async () => await invoke('stop_inference')
      }
    ];

    return [
      ...baseCommands,
      ...agents.map(a => ({
        id: `agent-${a.id}`,
        title: `Chat with ${a.name}`,
        asciiIcon: '[@]',
        danger: false,
        keywords: ['agent', 'persona', 'bot', a.name.toLowerCase()],
        action: () => {
          setActiveTab('chat');
          createThread();
          setConfig({ system_prompt: a.system_prompt });
        }
      })),
      ...models.map(m => ({
        id: `model-${m.path}`,
        title: `Load model: ${m.name}`,
        asciiIcon: '[#]',
        danger: false,
        keywords: ['model', 'load', 'llm', 'gguf', m.name.toLowerCase()],
        action: () => {
          setConfig({ modelPath: m.path });
        }
      }))
    ];
  }, [agents, models, setActiveTab, clearMessages, createThread, setConfig]);

  const fuse = useMemo(() => new Fuse(dynamicCommands, { keys: ['title', 'keywords'], threshold: 0.4 }), [dynamicCommands]);
  const filteredCommands = useMemo(() => query ? fuse.search(query).map(r => r.item) : dynamicCommands, [query, fuse, dynamicCommands]);

  const handleKeyDown = (e: any) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      playTokenSound();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      playTokenSound();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        playClickSound();
        filteredCommands[selectedIndex].action();
        setOmnibarOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOmnibarOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {isOmnibarOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 backdrop-blur-md bg-forge-bg/60" 
          onClick={() => setOmnibarOpen(false)}
        >
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="w-full max-w-2xl bg-forge-surface/90 backdrop-blur-xl border border-forge-border-subtle rounded shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col skeuo-bevel-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center px-4 py-4 border-b border-forge-border gap-3 bg-forge-surface-2/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-forge-accent/80 to-transparent shadow-[0_0_10px_var(--forge-accent)]" />
              <div className="text-forge-accent font-bold text-xl drop-shadow-[0_0_5px_var(--forge-accent)]">{'>'}</div>
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent border-none outline-none text-forge-text text-xl placeholder:text-forge-text-muted/50 font-mono tracking-widest uppercase"
                placeholder="EXECUTE COMMAND..."
                value={query}
                onChange={(e: any) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                  playTokenSound();
                }}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <div className="px-2 py-1 bg-forge-surface-3 rounded text-[10px] font-mono text-forge-accent border border-forge-border shadow-[0_0_10px_var(--forge-surface-3)]">
                ESC
              </div>
            </div>
            
            {filteredCommands.length > 0 ? (
              <div className="max-h-[60vh] overflow-y-auto py-2 custom-scrollbar overflow-x-hidden">
                <AnimatePresence mode="popLayout">
                  {filteredCommands.map((cmd, idx) => (
                    <motion.button
                      key={cmd.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ delay: idx * 0.03, type: 'spring', stiffness: 300, damping: 25 }}
                      onClick={() => {
                        playClickSound();
                        cmd.action();
                        setOmnibarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors relative group ${
                        idx === selectedIndex 
                          ? 'bg-forge-accent/10 text-forge-text' 
                          : 'hover:bg-forge-surface-3 text-forge-text-muted'
                      } ${cmd.danger && idx === selectedIndex ? '!bg-forge-danger/20 !text-red-400' : ''}`}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {idx === selectedIndex && (
                        <motion.div 
                          layoutId="omnibarSelection" 
                          className="absolute left-0 top-0 bottom-0 w-1 bg-forge-accent shadow-[0_0_10px_var(--forge-accent)]" 
                        />
                      )}
                      <span 
                        className={`font-mono font-bold text-lg w-8 text-center transition-colors ${
                          cmd.danger && idx === selectedIndex 
                            ? 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]' 
                            : (idx === selectedIndex ? 'text-forge-accent drop-shadow-[0_0_5px_var(--forge-accent)]' : '')
                        }`} 
                      >
                        {cmd.asciiIcon}
                      </span>
                      <span className="font-mono text-sm uppercase tracking-wider">{cmd.title}</span>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-forge-danger text-sm font-mono uppercase tracking-widest animate-pulse">
                SYS.ERR: COMMAND NOT FOUND
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
