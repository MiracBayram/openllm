import React, { useRef, useState, useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { useAudioEngine } from '../../hooks/useAudioEngine';

interface SpringSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  color?: string;
  detents?: number[];
}

export function SpringSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue = (v) => v.toString(),
  color = 'var(--forge-accent)',
  detents = []
}: SpringSliderProps) {
  const { playProceduralSound } = useAudioEngine();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Use a spring physics value for the handle position
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const springConfig = { stiffness: 400, damping: 30 };
  const handlePosition = useSpring(percentage, springConfig);

  // Sync external value changes to spring when not dragging
  useEffect(() => {
    if (!isDragging) {
      handlePosition.set(percentage);
    }
  }, [percentage, isDragging, handlePosition]);

  const updateValue = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newPercent = x / rect.width;
    let newValue = min + newPercent * (max - min);
    
    // Snap to step
    if (step > 0) {
      newValue = Math.round(newValue / step) * step;
    }
    
    // Haptic Detent Logic
    if (detents && detents.length > 0) {
      const nearestDetent = detents.find(d => Math.abs(newValue - d) < (max - min) * 0.05);
      if (nearestDetent !== undefined && Math.abs(value - nearestDetent) > 0.01) {
        // We hit a detent
        playProceduralSound('click');
        newValue = nearestDetent;
        handlePosition.set(((newValue - min) / (max - min)) * 100 + (Math.random() > 0.5 ? 2 : -2)); // overshoot
        setTimeout(() => handlePosition.set(((newValue - min) / (max - min)) * 100), 40); // settle back
      }
    }
    
    newValue = Math.max(min, Math.min(max, newValue));
    onChange(newValue);
    if (!detents?.includes(newValue)) {
      handlePosition.set(((newValue - min) / (max - min)) * 100);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updateValue(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      updateValue(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex flex-col gap-2 w-full group">
      <div className="flex justify-between items-center z-10 relative">
        <span className="text-[10px] text-forge-text-muted font-bold tracking-widest uppercase transition-colors group-hover:text-forge-text">
          {label}
        </span>
        <span className="text-xs font-mono text-forge-text font-bold">
          {formatValue(value)}
        </span>
      </div>
      
      <div 
        ref={containerRef}
        className="relative h-6 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Track Background */}
        <div className="absolute inset-x-0 h-1.5 bg-forge-surface-3 rounded-full overflow-hidden border border-forge-border-subtle shadow-inner" />
        
        {/* Fill Track */}
        <motion.div 
          className="absolute left-0 h-1.5 rounded-full"
          style={{ 
            width: useTransform(handlePosition, (v) => `${v}%`),
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}`
          }}
        />
        
        {/* Handle */}
        <motion.div 
          className="absolute h-5 w-5 bg-forge-bg border-2 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10 flex items-center justify-center cursor-grab active:cursor-grabbing"
          style={{ 
            left: useTransform(handlePosition, (v) => `calc(${v}% - 10px)`),
            borderColor: color
          }}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        </motion.div>
      </div>
    </div>
  );
}
