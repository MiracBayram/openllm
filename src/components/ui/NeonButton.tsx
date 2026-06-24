import { motion, HTMLMotionProps } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { forwardRef } from 'react';
import { useMicroInteractions } from '../../hooks/useMicroInteractions';
import { useTempoStore } from '../../store/tempoStore';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface NeonButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'accent' | 'danger' | 'warning' | 'success';
  glowOnHover?: boolean;
}

export const NeonButton = forwardRef<HTMLButtonElement, NeonButtonProps>(
  ({ className, variant = 'accent', glowOnHover = true, children, onClick, ...props }, ref) => {
    
    const { playClickSound } = useMicroInteractions();

    const variantClasses = {
      accent: 'text-forge-accent border-forge-accent/50 hover:bg-forge-accent/10 hover:border-forge-accent shadow-[0_0_10px_var(--forge-accent-muted)] hover:shadow-[0_0_20px_var(--forge-accent)]',
      danger: 'text-forge-danger border-forge-danger/50 hover:bg-forge-danger-bg hover:border-forge-danger shadow-[0_0_10px_var(--forge-danger-bg)] hover:shadow-[0_0_20px_var(--forge-danger)]',
      warning: 'text-forge-warning border-forge-warning/50 hover:bg-forge-warning-bg hover:border-forge-warning shadow-[0_0_10px_var(--forge-warning-bg)] hover:shadow-[0_0_20px_var(--forge-warning)]',
      success: 'text-forge-success border-forge-success/50 hover:bg-forge-success-bg hover:border-forge-success shadow-[0_0_10px_var(--forge-success-bg)] hover:shadow-[0_0_20px_var(--forge-success)]',
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      playClickSound();
      if (onClick) onClick(e);
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          'relative px-4 py-2 font-mono text-sm font-semibold rounded-md border backdrop-blur-sm transition-colors duration-200 uppercase tracking-widest',
          variantClasses[variant],
          !glowOnHover && 'shadow-none hover:shadow-none',
          className
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400 * useTempoStore((s) => s.tempoFactor), damping: 17 }}
        onClick={handleClick}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

NeonButton.displayName = 'NeonButton';
