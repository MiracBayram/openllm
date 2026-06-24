import { motion } from 'framer-motion';
import { GlassPanel } from './GlassPanel';
import { Database, FileText, Zap } from 'lucide-react';
import { Icon } from './Icon';

interface ChunkVizProps {
  chunks: string[];
  relevanceScores?: number[];
  query?: string;
}

export function ChunkViz({ chunks, relevanceScores, query }: ChunkVizProps) {
  if (!chunks || chunks.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 w-full p-4">
      <div className="flex items-center justify-between border-b border-forge-border-subtle pb-2">
        <div className="flex items-center gap-2">
          <Icon icon={Database} className="text-forge-accent animate-pulse" size={16} />
          <span className="font-mono text-xs uppercase tracking-widest text-forge-accent font-bold">Vector DB Retrieval</span>
        </div>
        {query && (
          <div className="text-xs font-mono text-forge-text-muted bg-forge-surface px-2 py-1 rounded border border-forge-border truncate max-w-[200px]">
            Q: {query}
          </div>
        )}
      </div>

      <div className="relative w-full min-h-[400px] flex items-center justify-center overflow-hidden bg-forge-surface-2/20 border border-forge-border-subtle rounded-xl mt-4">
        
        {/* SVG connection lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {chunks.map((_, idx) => {
            const score = relevanceScores ? relevanceScores[idx] : Math.random() * 0.5 + 0.4;
            const angle = (idx / chunks.length) * Math.PI * 2;
            const radius = 150 * (1 - score) + 60; 
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            return (
              <g key={`line-${idx}`}>
                <line 
                  x1="50%" y1="50%" 
                  x2={`calc(50% + ${x}px)`} y2={`calc(50% + ${y}px)`} 
                  stroke="var(--forge-border-subtle)" 
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                {/* Animated pulse traveling from chunk to center */}
                <motion.circle
                  r="2"
                  fill="var(--forge-accent)"
                  initial={{ cx: `calc(50% + ${x}px)`, cy: `calc(50% + ${y}px)` }}
                  animate={{ cx: '50%', cy: '50%', opacity: [1, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: idx * 0.2 }}
                />
              </g>
            );
          })}
        </svg>

        {/* Central Query Node */}
        <div className="relative z-10 w-16 h-16 rounded-full bg-forge-surface border-2 border-forge-accent flex items-center justify-center shadow-[0_0_30px_var(--forge-accent-muted)]">
          <Icon icon={Database} className="text-forge-accent" size={24} />
          <motion.div 
            className="absolute inset-0 rounded-full border border-forge-accent"
            animate={{ scale: [1, 1.5], opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </div>

        {/* Orbiting Chunks */}
        {chunks.map((chunk, idx) => {
          const score = relevanceScores ? relevanceScores[idx] : Math.random() * 0.5 + 0.4;
          const isHighRelevance = score > 0.8;
          const angle = (idx / chunks.length) * Math.PI * 2;
          const radius = 150 * (1 - score) + 60;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          
          return (
            <motion.div
              key={idx}
              className="absolute z-20 group cursor-crosshair"
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, x: '-50%', y: '-50%' }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 80, damping: 14, delay: idx * 0.08 }}
            >
              {/* Chunk Node */}
              <div className={`w-4 h-4 rounded-full border border-forge-bg shadow-lg ${isHighRelevance ? 'bg-forge-success shadow-[0_0_10px_var(--forge-success)]' : 'bg-forge-accent shadow-[0_0_10px_var(--forge-accent)]'}`} />

              {/* Hover Card */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-64 pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-50">
                <GlassPanel 
                  intensity="high" 
                  className={`p-3 border-l-2 relative overflow-hidden shadow-2xl ${
                    isHighRelevance ? 'border-l-forge-success' : 'border-l-forge-accent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-forge-text-muted uppercase">
                      <Icon icon={FileText} size={12} />
                      <span>Chunk {idx + 1}</span>
                    </div>
                    <div className={`flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isHighRelevance ? 'bg-forge-success/20 text-forge-success' : 'bg-forge-accent/20 text-forge-accent'
                    }`}>
                      {isHighRelevance && <Icon icon={Zap} size={10} />}
                      <span>{(score * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  
                  <p className="text-xs text-forge-text font-mono line-clamp-4 leading-relaxed">
                    {chunk}
                  </p>
                </GlassPanel>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
