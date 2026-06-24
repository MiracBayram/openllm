import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export function useTauriEvent<T>(eventName: string, handler: (event: T) => void) {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let isMounted = true;

    let isQueued = false;
    let payloadQueue: T[] = [];

    listen<T>(eventName, (event) => {
      if (!isMounted) return;
      payloadQueue.push(event.payload);
      
      if (!isQueued) {
        isQueued = true;
        const processQueue = () => {
          if (!isMounted) return;
          if (payloadQueue.length > 0) {
            const toProcess = payloadQueue.splice(0, 200);
            toProcess.forEach(p => savedHandler.current(p));
          }
          if (payloadQueue.length > 0) {
            requestAnimationFrame(processQueue);
          } else {
            isQueued = false;
          }
        };
        requestAnimationFrame(processQueue);
      }
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [eventName]);
}
