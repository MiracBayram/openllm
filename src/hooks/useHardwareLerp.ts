import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { calculateOOMRisk } from '../utils/oomCalculator';

interface HardwareProfile {
  vram_used: number;
  vram_total: number;
  ram_used: number;
  ram_total: number;
  cpu_usage?: number; // Optional based on backend support
}

export function useHardwareLerp() {
  const [displayVram, setDisplayVram] = useState(0);
  const [displayCpu, setDisplayCpu] = useState(0);
  const [displayRam, setDisplayRam] = useState(0);
  const targetVram = useRef(0);
  const targetCpu = useRef(0);
  const targetRam = useRef(0);

  const [totalVram, setTotalVram] = useState(8192); // Default 8GB until payload arrives

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startLerp = () => {
      if (!intervalId) {
        intervalId = setInterval(() => {
          let isAnimating = false;
          setDisplayVram((prev: number) => {
            const diff = targetVram.current - prev;
            if (Math.abs(diff) >= 0.5) isAnimating = true;
            return Math.abs(diff) < 0.5 ? targetVram.current : prev + diff * 0.2;
          });
          setDisplayCpu((prev: number) => {
            const diff = targetCpu.current - prev;
            if (Math.abs(diff) >= 0.5) isAnimating = true;
            return Math.abs(diff) < 0.5 ? targetCpu.current : prev + diff * 0.2;
          });
          setDisplayRam((prev: number) => {
            const diff = targetRam.current - prev;
            if (Math.abs(diff) >= 0.5) isAnimating = true;
            return Math.abs(diff) < 0.5 ? targetRam.current : prev + diff * 0.2;
          });

          setTimeout(() => {
            if (!isAnimating && intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }, 0);
        }, 50);
      }
    };

    // 10s Idle Poll listener
    const unlistenTick = listen<HardwareProfile>('forge://hardware_tick', (event) => {
      targetVram.current = event.payload.vram_used;
      if (event.payload.ram_used) targetRam.current = event.payload.ram_used;
      if (event.payload.vram_total) setTotalVram(event.payload.vram_total);
      if (event.payload.cpu_usage) targetCpu.current = event.payload.cpu_usage;
      startLerp();
    });

    // Instant Snap Listener (State Transition)
    const unlistenSnap = listen<HardwareProfile>('forge://hardware_snap', (event) => {
      targetVram.current = event.payload.vram_used;
      if (event.payload.vram_total) setTotalVram(event.payload.vram_total);
      if (event.payload.ram_used) {
        targetRam.current = event.payload.ram_used;
        setDisplayRam(event.payload.ram_used);
      }
      if (event.payload.cpu_usage) {
        targetCpu.current = event.payload.cpu_usage;
        setDisplayCpu(event.payload.cpu_usage);
      }
      setDisplayVram(event.payload.vram_used); // Instant update
    });

    return () => {
      unlistenTick.then(f => f());
      unlistenSnap.then(f => f());
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const oomRisk = calculateOOMRisk(displayVram, totalVram);

  return {
    vramUsedMb: Math.round(displayVram),
    ramUsedMb: Math.round(displayRam),
    cpuUsage: Math.round(displayCpu),
    oomRisk
  };
}
