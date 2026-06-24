import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAudioEngine } from '../../hooks/useAudioEngine';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  activationTime: number;
}

interface Edge {
  source: number;
  target: number;
  distance: number;
}

const PHASES = [
  'AWAITING MODEL',
  'PARSING HEADER',
  'ALLOCATING TENSORS',
  'MAPPING MEMORY',
  'WAKING NEURONS',
  'ONLINE'
];

export function NeuralLoader({ onComplete }: { onComplete?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const { playProceduralSound } = useAudioEngine();

  useEffect(() => {
    // Play the low frequency drone sound once when loader mounts
    playProceduralSound('loading');
  }, [playProceduralSound]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const computedStyle = getComputedStyle(document.documentElement);
    // Parse hex to rgba
    const hexColor = computedStyle.getPropertyValue('--forge-accent').trim() || '#00E5FF';
    let r = 0, g = 229, b = 255;
    if (hexColor.startsWith('#')) {
      const hex = hexColor.replace('#', '');
      if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      }
    }

    const numNodes = 100;
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const maxDistance = 150;

    // Initialize nodes
    for (let i = 0; i < numNodes; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        active: false,
        activationTime: 0,
      });
    }

    // Pre-calculate edges
    for (let i = 0; i < numNodes; i++) {
      for (let j = i + 1; j < numNodes; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDistance) {
          edges.push({ source: i, target: j, distance: dist });
        }
      }
    }

    const startTime = Date.now();
    const duration = 5000; // 5 seconds total loading animation

    const render = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update Phase text
      const currentPhase = Math.floor(progress * (PHASES.length - 1));
      if (currentPhase !== phaseIndex) {
        setPhaseIndex(currentPhase);
        playProceduralSound('click');
      }

      if (progress === 1 && onComplete) {
        playProceduralSound('complete');
        onComplete();
        return;
      }

      ctx.clearRect(0, 0, width, height);
      
      // Simulate wave of activation from left to right
      const waveX = progress * width * 1.2;

      // Update nodes
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        if (!node.active && node.x < waveX) {
          node.active = true;
          node.activationTime = Date.now();
        }
      });

      // Draw edges
      edges.forEach((edge) => {
        const n1 = nodes[edge.source];
        const n2 = nodes[edge.target];
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDistance) {
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);

          // Both active -> bright connection
          if (n1.active && n2.active) {
            const alpha = 1 - (dist / maxDistance);
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`; // Theme glow
            ctx.lineWidth = 1.5;
          } else {
            const alpha = (1 - (dist / maxDistance)) * 0.1;
            ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`; // Slate grey
            ctx.lineWidth = 0.5;
          }
          
          ctx.stroke();
        }
      });

      // Draw nodes
      nodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.active ? 3 : 1.5, 0, Math.PI * 2);
        
        if (node.active) {
          const timeSinceActive = Date.now() - node.activationTime;
          const flash = Math.max(0, 1 - timeSinceActive / 500); // 500ms flash
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + flash * 0.5})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = hexColor;
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.shadowBlur = 0;
        }
        
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [onComplete, phaseIndex, playProceduralSound]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forge-bg overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      <div className="relative z-10 flex flex-col items-center">
        <motion.div 
          className="w-64 h-1 bg-forge-surface-3 rounded-full overflow-hidden mb-4 border border-forge-border-subtle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div 
            className="h-full bg-forge-accent shadow-[0_0_10px_var(--forge-accent)]"
            initial={{ width: '0%' }}
            animate={{ width: `${(phaseIndex / (PHASES.length - 1)) * 100}%` }}
            transition={{ type: 'spring', bounce: 0 }}
          />
        </motion.div>
        
        <AnimatePresence mode="wait">
          <motion.p
            key={phaseIndex}
            initial={{ opacity: 0, y: 5, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -5, filter: 'blur(4px)' }}
            className="font-mono text-forge-accent tracking-widest text-sm"
          >
            [{PHASES[phaseIndex]}]
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
