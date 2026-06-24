import { useRef, useEffect } from 'react';

// Throttle implementation to avoid Jank (Red Flag 2)
function throttle(func: Function, limit: number) {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

export function useMagnetic(magneticPull: number = 0.2) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let rafId: number;

    const handleMouseMove = throttle((e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { left, top, width, height } = element.getBoundingClientRect();
      
      const x = (clientX - (left + width / 2)) * magneticPull;
      const y = (clientY - (top + height / 2)) * magneticPull;
      
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        element.style.transform = `translate(${x}px, ${y}px)`;
      });
    }, 16); // ~60fps throttle

    const handleMouseLeave = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        element.style.transform = `translate(0px, 0px)`;
      });
    };

    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [magneticPull]);

  return ref;
}
