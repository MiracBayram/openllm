import { useAudioEngine } from './useAudioEngine';

export function useMicroInteractions() {
  const { playProceduralSound } = useAudioEngine();

  const playClickSound = () => playProceduralSound('click');
  const playTokenSound = () => playProceduralSound('token');
  const playCompleteSound = () => playProceduralSound('complete');
  const playGlitchSound = () => playProceduralSound('glitch');

  // We can add more visual micro-interactions here in the future
  // like triggering a global pulse event or success flash state

  return {
    playClickSound,
    playTokenSound,
    playCompleteSound,
    playGlitchSound
  };
}
