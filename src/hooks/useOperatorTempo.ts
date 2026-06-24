import { useEffect, useRef } from 'react';
import { useTempoStore } from '../store/tempoStore';

export function useOperatorTempo() {
  const keyTimestamps = useRef<number[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only track character keys or backspace, ignore modifiers
      if (e.key.length !== 1 && e.key !== 'Backspace') return;

      const now = Date.now();
      
      // Keep only timestamps from the last 3 seconds
      keyTimestamps.current = [...keyTimestamps.current, now].filter(t => now - t < 3000);
      
      const keystrokesIn3s = keyTimestamps.current.length;
      
      // Calculate tempo: 15 keystrokes in 3s = 5 keys/sec (~60 WPM) -> factor 1.0
      // 30 keystrokes in 3s = 10 keys/sec (~120 WPM) -> factor 2.0
      // Cap at 2.0, min at 0.5 for UI math
      const tempo = Math.max(0.5, Math.min(keystrokesIn3s / 15, 2.0));
      
      useTempoStore.getState().setTempoFactor(tempo);
      document.documentElement.style.setProperty('--tempo-factor', String(tempo.toFixed(2)));
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Decelerator loop
    const interval = setInterval(() => {
      const now = Date.now();
      keyTimestamps.current = keyTimestamps.current.filter(t => now - t < 3000);
      if (keyTimestamps.current.length === 0) {
        useTempoStore.getState().setTempoFactor(0.5);
        document.documentElement.style.setProperty('--tempo-factor', '0.5'); // lowest idle state
      }
    }, 1000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(interval);
    };
  }, []);
}
