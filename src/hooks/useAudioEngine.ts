import { useCallback, useEffect, useRef } from 'react';

type SoundType = 'click' | 'token' | 'complete' | 'glitch' | 'morph' | 'loading' | 'oom_klaxon';

export function useAudioEngine() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const lastPlayTimeRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // Initialize lazily to respect browser auto-play policies
    const initAudio = () => {
      if (!audioCtxRef.current) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(30, ctx.currentTime);
        compressor.ratio.setValueAtTime(12, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);
        
        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.8;
        
        masterGain.connect(compressor);
        compressor.connect(ctx.destination);
        
        masterGainRef.current = masterGain;
      }
    };
    
    document.addEventListener('click', initAudio, { once: true });
    return () => {
      document.removeEventListener('click', initAudio);
    };
  }, []);

  const playProceduralSound = useCallback((type: SoundType) => {
    if (!audioCtxRef.current || !masterGainRef.current) return;
    
    const nowMs = performance.now();
    if (lastPlayTimeRef.current[type] && nowMs - lastPlayTimeRef.current[type] < 50) {
      return; // throttle 50ms per type to prevent clipping
    }
    lastPlayTimeRef.current[type] = nowMs;

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(masterGainRef.current);

    const now = ctx.currentTime;
    let duration = 0;

    switch (type) {
      case 'click':
        // High pitched short click
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        duration = 0.05;
        osc.stop(now + duration);
        break;
      
      case 'token':
        // Extremely short, high frequency "tick" for streaming tokens
        osc.type = 'square';
        osc.frequency.setValueAtTime(2000, now);
        gainNode.gain.setValueAtTime(0.02, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
        osc.start(now);
        duration = 0.02;
        osc.stop(now + duration);
        break;

      case 'complete':
        // Satisfying low bass hum/wave
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        duration = 0.3;
        osc.stop(now + duration);
        break;

      case 'glitch':
        // Persona morphing glitch
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.setValueAtTime(400, now + 0.05);
        osc.frequency.setValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        duration = 0.15;
        osc.stop(now + duration);
        break;

      case 'morph':
        // Smooth morphing sweep (low to high frequency)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.4);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now);
        duration = 0.4;
        osc.stop(now + duration);
        break;

      case 'loading':
        // Neural loading drone / hum (deep low frequency that sustains)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.linearRampToValueAtTime(65, now + 1.0);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 0.5); // subtle!
        gainNode.gain.linearRampToValueAtTime(0, now + 2.0);
        osc.start(now);
        duration = 2.0;
        osc.stop(now + duration);
        break;

      case 'oom_klaxon':
        // Alarm klaxon, square wave with pitch drop
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.5);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        duration = 0.8;
        osc.stop(now + duration);
        break;
    }
    
    osc.onended = () => {
      osc.disconnect();
      gainNode.disconnect();
    };
  }, []);

  return { playProceduralSound };
}
