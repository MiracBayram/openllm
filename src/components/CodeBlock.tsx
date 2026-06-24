import { useEffect, useState, useRef } from 'react';
import { Icon } from './ui/Icon';
import { Copy, Check } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useToastStore } from '../store/toastStore';

// Singleton worker to avoid creating multiple instances
let worker: Worker | null = null;
const callbacks = new Map<string, (html: string) => void>();

function getWorker() {
  if (typeof window === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('../workers/shiki.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, html } = e.data;
      if (id && callbacks.has(id)) {
        callbacks.get(id)!(html);
        callbacks.delete(id);
      }
    };
  }
  return worker;
}

export function CodeBlock({ code, lang }: { code: string, lang: string }) {
  const [html, setHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const idRef = useRef(Math.random().toString(36).substring(7));

  useEffect(() => {
    const w = getWorker();
    if (!w) return;

    callbacks.set(idRef.current, (result) => {
      setHtml(result);
    });

    w.postMessage({ id: idRef.current, code, lang });

    return () => {
      callbacks.delete(idRef.current);
    };
  }, [code, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    useToastStore.getState().addToast({
      type: 'success',
      title: 'Kopyalandı',
      message: 'Kod bloğu panoya kopyalandı.'
    });
  };

  return (
    <div className="relative group rounded-md overflow-hidden border border-forge-border my-4">
      <div className="flex items-center justify-between px-4 py-1 bg-forge-bg/60 border-b border-forge-border">
        <span className="text-xs font-mono text-forge-text-muted">{lang}</span>
        <button 
          onClick={handleCopy}
          className="text-xs text-forge-text/70 hover:text-forge-accent skeuo-btn px-2 py-0.5 rounded transition-colors flex items-center gap-1"
        >
          <Icon icon={copied ? Check : Copy} size={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {html ? (
        <div 
          className="shiki-container text-sm"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} 
        />
      ) : (
        <pre className="p-4 bg-[rgba(0,0,0,0.3)] text-sm animate-pulse text-forge-text-muted"><code>{code}</code></pre>
      )}
    </div>
  );
}
