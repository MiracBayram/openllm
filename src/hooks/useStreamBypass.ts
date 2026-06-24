import { useRef, useEffect } from 'react';
import { useTauriEvent } from './useTauriEvent';
import { TelemetryRingBuffer } from '../utils/TelemetryRingBuffer';

export function useStreamBypass(messageId: string | null, onFirstToken?: () => void) {
  const domNodeRef = useRef<HTMLSpanElement | null>(null);
  const bufferRef = useRef<string>('');
  const totalBufferRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  const timingBufferRef = useRef(new TelemetryRingBuffer(40));
  const lastTokenTimeRef = useRef(performance.now());

  const flushBufferToDOM = () => {
    if (domNodeRef.current && bufferRef.current.length > 0) {
      const lastChild = domNodeRef.current.lastChild;
      if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
        (lastChild as Text).appendData(bufferRef.current);
      } else {
        const textNode = document.createTextNode(bufferRef.current);
        domNodeRef.current.appendChild(textNode);
      }
      bufferRef.current = ''; 
    }
    rafIdRef.current = null;
  };

  useTauriEvent<string>('forge://token', (token) => {
    if (!messageId) return; // if no active stream
    
    // We expect the backend to just send the raw string token since we batch it.
    // Or if it sends JSON `{ id, token }`, adjust here. The current commands.rs sends raw string.
    
    if (totalBufferRef.current.length === 0 && onFirstToken) {
      onFirstToken();
    }
    
    const now = performance.now();
    const dt = now - lastTokenTimeRef.current;
    timingBufferRef.current.push(dt);
    lastTokenTimeRef.current = now;
    
    bufferRef.current += token;
    totalBufferRef.current += token;

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushBufferToDOM);
    }
  });

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const getFinalContent = () => {
    const final = totalBufferRef.current;
    totalBufferRef.current = ''; // Reset after getting
    return final;
  };

  return { domNodeRef, getFinalContent, timingBufferRef };
}
