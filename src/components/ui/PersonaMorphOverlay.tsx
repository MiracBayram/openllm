import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '../../store/uiStore';
import { usePersonaStore } from '../../store/personaStore';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useEffect, useState } from 'react';

export function PersonaMorphOverlay() {
  const { morphingTo, clearMorphing } = useUiStore();
  const { setPersonaDirectly } = usePersonaStore();
  const { playProceduralSound } = useAudioEngine();
  const [isActive, setIsActive] = useState(false);
  const [displayPersona, setDisplayPersona] = useState<string>('');

  useEffect(() => {
    if (morphingTo && !isActive) {
      setIsActive(true);
      setDisplayPersona(morphingTo.replace('_', ' ').toUpperCase());
      
      // Phase 1: Collapse & Glitch
      playProceduralSound('glitch');

      // Phase 2: Theme swap mid-animation
      setTimeout(() => {
        setPersonaDirectly(morphingTo as any);
      }, 300);

      // Phase 3: Bloom
      setTimeout(() => {
        playProceduralSound('morph');
      }, 500);

      // Reset
      setTimeout(() => {
        setIsActive(false);
        clearMorphing();
      }, 1000);
    }
  }, [morphingTo, isActive, playProceduralSound, setPersonaDirectly, clearMorphing]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none bg-forge-bg mix-blend-difference"
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: [0, 1, 1, 0],
            scaleY: [1, 0.02, 0.02, 1],
            filter: ['brightness(1) contrast(1)', 'brightness(2) contrast(1.5) hue-rotate(90deg)', 'brightness(2) contrast(1.5) hue-rotate(90deg)', 'brightness(1) contrast(1)']
          }}
          transition={{ duration: 0.8, times: [0, 0.3, 0.5, 1], ease: 'easeInOut' }}
          style={{ transformOrigin: 'center' }}
        >
          <motion.div
            className="text-4xl md:text-6xl font-bold font-mono tracking-[0.5em] text-forge-accent opacity-0"
            animate={{ opacity: [0, 0, 1, 0] }}
            transition={{ duration: 0.8, times: [0, 0.4, 0.5, 1] }}
          >
            REINITIALIZING :: {displayPersona}
          </motion.div>
          
          {/* CRT scanlines effect overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-50" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
