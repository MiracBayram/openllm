import { motion, HTMLMotionProps } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { forwardRef } from 'react';

// A simple utility to merge tailwind classes
function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface GlassPanelProps extends HTMLMotionProps<'div'> {
  intensity?: 'low' | 'medium' | 'high';
  border?: boolean;
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, intensity = 'medium', border = true, children, ...props }, ref) => {
    
    const intensityClasses = {
      low: 'bg-forge-surface/40 backdrop-blur-sm',
      medium: 'bg-forge-surface/60 backdrop-blur-md',
      high: 'bg-forge-surface/80 backdrop-blur-xl',
    };

    return (
      <motion.div
        ref={ref}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
          e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
        }}
        className={cn(
          'glass-panel-glow relative overflow-hidden rounded-xl shadow-2xl',
          intensityClasses[intensity],
          border && 'border border-forge-border-subtle',
          // Top highlight to simulate glass edge
          border && 'before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
          className
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassPanel.displayName = 'GlassPanel';
