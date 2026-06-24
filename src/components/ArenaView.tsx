import { useState } from 'react';
import { GlassPanel } from './ui/GlassPanel';
import { NeonButton } from './ui/NeonButton';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Play, Square, Users, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useMicroInteractions } from '../hooks/useMicroInteractions';

interface ArenaAgent {
  id: string;
  name: string;
  role: string;
  color: string;
}

const DUMMY_AGENTS: ArenaAgent[] = [
  { id: '1', name: 'Black Ice', role: 'Critic', color: 'var(--forge-accent)' },
  { id: '2', name: 'Neon Rain', role: 'Creator', color: 'var(--forge-danger)' },
  { id: '3', name: 'Code Wizard', role: 'Architect', color: 'var(--forge-success)' },
];

export function ArenaView() {
  const [isRunning, setIsRunning] = useState(false);
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<{agentId: string, content: string}[]>([]);
  const { playClickSound, playGlitchSound } = useMicroInteractions();

  const handleStart = () => {
    if (!topic.trim()) return;
    playGlitchSound();
    setIsRunning(true);
    setMessages([{ agentId: 'system', content: `INITIATING ROUNDTABLE: ${topic}` }]);
    
    // Simulate agents talking
    setTimeout(() => {
      setMessages(prev => [...prev, { agentId: '2', content: "I'll start. This topic requires out-of-the-box thinking. What if we inverse the paradigm?" }]);
    }, 2000);

    setTimeout(() => {
      setMessages(prev => [...prev, { agentId: '1', content: "Invalid approach. Inversing the paradigm introduces O(N^2) complexity. We must optimize." }]);
    }, 4500);
  };

  const handleStop = () => {
    playClickSound();
    setIsRunning(false);
  };

  return (
    <div className="flex flex-col h-full bg-forge-bg overflow-hidden p-6 gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-forge-text drop-shadow-[0_0_10px_var(--forge-text)] tracking-wider">ARENA</h1>
          <p className="text-forge-text-muted font-mono text-sm tracking-widest uppercase mt-1">Multi-Agent Deliberation Engine</p>
        </div>
        
        <GlassPanel intensity="low" className="flex items-center gap-4 px-4 py-2 border-forge-border-subtle">
          <>
            <div className="flex items-center gap-2">
              <Icon icon={Users} className="text-forge-accent" size={18} />
              <span className="font-mono text-forge-text font-bold text-sm">3 AGENTS</span>
            </div>
            <div className="w-px h-4 bg-forge-border" />
            <div className="flex items-center gap-2">
              <Icon icon={Zap} className="text-forge-warning" size={18} />
              <span className="font-mono text-forge-text font-bold text-sm">AUTO-RESOLVE</span>
            </div>
          </>
        </GlassPanel>
      </div>

      <div className="flex gap-6 h-full min-h-0">
        {/* Arena Configuration Sidebar */}
        <div className="w-80 flex flex-col gap-4">
          <GlassPanel className="p-4 flex flex-col gap-4 border-forge-accent/20 flex-1">
            <>
              <div className="font-mono text-xs text-forge-accent tracking-widest uppercase font-bold border-b border-forge-border pb-2 mb-2">
                Configuration
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="font-mono text-[10px] text-forge-text-muted uppercase tracking-wider">Debate Topic</label>
                <textarea 
                  className="w-full bg-forge-surface-2 border border-forge-border rounded-lg p-3 text-sm font-mono text-forge-text focus:outline-none focus:border-forge-accent transition-colors resize-none h-32"
                  placeholder="Enter a topic for the agents to discuss..."
                  value={topic}
                  onChange={e => setTopic((e.target as HTMLTextAreaElement).value)}
                  disabled={isRunning}
                />
              </div>

              <div className="flex flex-col gap-2 flex-1">
                <label className="font-mono text-[10px] text-forge-text-muted uppercase tracking-wider">Active Participants</label>
                <div className="flex flex-col gap-2">
                  {DUMMY_AGENTS.map(agent => (
                    <div key={agent.id} className="flex items-center gap-3 p-2 rounded border border-forge-border bg-forge-surface-2/50">
                      <div className="w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]" style={{ color: agent.color, backgroundColor: agent.color }} />
                      <div className="flex flex-col">
                        <span className="font-mono text-sm text-forge-text font-bold">{agent.name}</span>
                        <span className="font-mono text-[10px] text-forge-text-muted uppercase tracking-wider">{agent.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto">
                {isRunning ? (
                  <NeonButton variant="danger" className="w-full" onClick={handleStop}>
                    <Icon icon={Square} size={16} className="inline-block mr-2 -mt-0.5" />
                    Halt Simulation
                  </NeonButton>
                ) : (
                  <NeonButton variant="accent" className="w-full" onClick={handleStart} disabled={!topic.trim()}>
                    <Icon icon={Play} size={16} className="inline-block mr-2 -mt-0.5" />
                    Initialize Arena
                  </NeonButton>
                )}
              </div>
            </>
          </GlassPanel>
        </div>

        {/* Main Arena Output */}
        <GlassPanel className="flex-1 flex flex-col border-forge-border-subtle relative overflow-hidden">
          {/* Holographic grid background */}
          <div className="absolute inset-0 pointer-events-none opacity-5" 
            style={{ backgroundImage: 'linear-gradient(var(--forge-border) 1px, transparent 1px), linear-gradient(90deg, var(--forge-border) 1px, transparent 1px)', backgroundSize: '20px 20px' }} 
          />

          <div className="flex-1 flex flex-col relative z-10">
            {/* The Coliseum Stage */}
            <div className="relative flex-1 min-h-[300px] flex items-center justify-center border-b border-forge-border-subtle/50">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-forge-text-muted opacity-50 absolute">
                  <Icon icon={Users} size={48} className="mb-4" />
                  <p className="font-mono tracking-widest uppercase text-sm">Awaiting Topic Initialization</p>
                </div>
              ) : (
                <>
                  {/* Consensus Meter */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                    <span className="font-mono text-[10px] text-forge-text-muted mb-2 tracking-widest uppercase">Consensus Shift</span>
                    <div className="w-48 h-2 bg-forge-surface-3 rounded-full overflow-hidden relative border border-forge-border-subtle">
                      <motion.div 
                        className="absolute top-0 bottom-0 bg-forge-text"
                        initial={{ width: 0, left: '50%' }}
                        animate={{ 
                          // Very simple dummy heuristic for consensus:
                          // If last message was Black Ice (Critic), shift left (-0.6). If Architect, shift right (+0.6).
                          left: messages[messages.length - 1]?.agentId === '1' ? '20%' : messages[messages.length - 1]?.agentId === '3' ? '80%' : '50%',
                          width: '4px',
                          x: '-50%'
                        }}
                        style={{ boxShadow: '0 0 10px currentColor' }}
                        transition={{ type: 'spring', stiffness: 60, damping: 15 }}
                      />
                      <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/20" />
                    </div>
                  </div>

                  {/* Agents Ring */}
                  {DUMMY_AGENTS.map((agent, index) => {
                    const angle = (index / DUMMY_AGENTS.length) * Math.PI * 2 - Math.PI / 2;
                    const radius = 150;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    const isSpeaking = isRunning && messages[messages.length - 1]?.agentId === agent.id;
                    const lastMsg = messages.filter(m => m.agentId === agent.id).pop();

                    return (
                      <motion.div 
                        key={agent.id}
                        className="absolute flex flex-col items-center justify-center z-10"
                        style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, x: '-50%', y: '-50%' }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <motion.div
                          animate={{ 
                            boxShadow: isSpeaking ? `0 0 40px ${agent.color}` : `0 0 8px ${agent.color}40`,
                            scale: isSpeaking ? 1.1 : 1,
                            borderColor: isSpeaking ? agent.color : 'var(--forge-border)'
                          }}
                          transition={{ duration: 0.3 }}
                          className="w-16 h-16 rounded-full flex items-center justify-center bg-forge-surface-2 border-2 relative"
                        >
                          <Icon icon={Bot} style={{ color: agent.color }} size={28} />
                          {isSpeaking && (
                            <motion.div 
                              className="absolute inset-0 rounded-full border border-current"
                              style={{ color: agent.color }}
                              animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                              transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                            />
                          )}
                        </motion.div>
                        <span className="mt-3 font-mono text-xs font-bold px-2 py-1 bg-forge-surface-2/80 rounded border border-forge-border-subtle backdrop-blur" style={{ color: agent.color }}>
                          {agent.name}
                        </span>

                        <AnimatePresence>
                          {isSpeaking && lastMsg && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.9 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="absolute top-full mt-4 w-64 p-3 rounded-lg bg-forge-surface/95 border backdrop-blur text-sm text-center font-mono shadow-2xl z-20"
                              style={{ borderColor: agent.color, color: agent.color }}
                            >
                              "{lastMsg.content.length > 80 ? lastMsg.content.slice(0, 80) + '...' : lastMsg.content}"
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Scrolling Transcript Log at the bottom */}
            <div className="h-48 overflow-y-auto custom-scrollbar p-4 bg-forge-bg/50 border-t border-forge-border flex flex-col gap-2">
              <span className="font-mono text-[10px] text-forge-text-muted uppercase tracking-widest sticky top-0 bg-forge-bg/90 pb-2">Arena Transcript</span>
              {messages.map((msg, i) => {
                if (msg.agentId === 'system') return (
                  <div key={i} className="text-forge-accent text-xs font-mono py-1 opacity-70">&gt; {msg.content}</div>
                );
                const agent = DUMMY_AGENTS.find(a => a.id === msg.agentId);
                return (
                  <div key={i} className="flex gap-2 text-xs font-mono py-1">
                    <span style={{ color: agent?.color }}>[{agent?.name}]</span>
                    <span className="text-forge-text-secondary">{msg.content}</span>
                  </div>
                );
              })}
              {isRunning && messages.length > 0 && (
                <div className="text-forge-text-muted text-xs font-mono animate-pulse mt-2">
                  &gt; Deliberation in progress...
                </div>
              )}
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
