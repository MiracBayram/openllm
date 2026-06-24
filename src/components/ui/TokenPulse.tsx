import { motion } from 'framer-motion';

export function TokenPulse({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      initial={{ opacity: 1, textShadow: '0 0 15px var(--forge-accent), 0 0 30px var(--forge-accent)' }}
      animate={{ opacity: 1, textShadow: '0 0 0px var(--forge-accent), 0 0 0px var(--forge-accent)' }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="inline-block relative"
    >
      {/* Glitch sub-layer */}
      <motion.span
        className="absolute inset-0 text-forge-accent mix-blend-screen opacity-50"
        initial={{ x: -2, opacity: 1 }}
        animate={{ x: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        aria-hidden="true"
      >
        {children}
      </motion.span>
      {children}
    </motion.span>
  );
}
