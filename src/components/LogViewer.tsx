import { useEffect, useRef, useState } from 'react';
import { useLogStore } from '../store/logStore';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { Terminal, X, Trash2, Copy, Play, Square } from 'lucide-react';
import { Icon } from './ui/Icon';

export function LogViewer() {
  const { logs, isOpen, setIsOpen, addLog, clearLogs } = useLogStore();
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Anlık rust stdout loglarını dinle
  useTauriEvent<string>('forge://stdout', (msg) => {
    addLog(msg, 'info');
  });

  useTauriEvent<string>('forge://stderr', (msg) => {
    addLog(msg, 'error');
  });

  useTauriEvent<string>('forge://log', (msg) => {
    addLog(msg, 'debug');
  });

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    const text = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 h-72 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-forge-border z-40 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-slide-up">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-forge-border/50">
        <div className="flex items-center gap-2">
          <Icon icon={Terminal} size={16} className="text-forge-text-muted" />
          <span className="text-xs font-mono text-forge-text-muted uppercase tracking-widest">Forge Integrated Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setAutoScroll(!autoScroll)} 
            className={`p-1.5 rounded transition-colors ${autoScroll ? 'text-forge-accent bg-forge-accent/10' : 'text-forge-text-muted hover:text-forge-text'}`}
            title="Auto-Scroll"
          >
            <Icon icon={autoScroll ? Play : Square} size={14} />
          </button>
          <button onClick={handleCopy} className="p-1.5 text-forge-text-muted hover:text-forge-text transition-colors" title="Copy All">
            <Icon icon={Copy} size={14} />
          </button>
          <button onClick={clearLogs} className="p-1.5 text-forge-text-muted hover:text-red-400 transition-colors" title="Clear Logs">
            <Icon icon={Trash2} size={14} />
          </button>
          <div className="w-px h-4 bg-forge-border mx-1" />
          <button onClick={() => setIsOpen(false)} className="p-1.5 text-forge-text-muted hover:text-forge-text transition-colors" title="Close Terminal">
            <Icon icon={X} size={16} />
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs custom-scrollbar">
        {logs.length === 0 ? (
          <div className="text-forge-text-muted/50 italic select-none">Waiting for incoming logs...</div>
        ) : (
          <div className="flex flex-col">
            {logs.map((log) => (
              <div key={log.id} className="flex hover:bg-white/5 py-0.5 rounded px-1 transition-colors group">
                <span className="text-forge-text-muted/50 w-24 shrink-0 select-none">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`flex-1 break-all ${
                  log.level === 'error' ? 'text-red-400' : 
                  log.level === 'warn' ? 'text-yellow-400' : 
                  'text-emerald-400/90'
                }`}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
