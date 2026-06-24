import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Layers, Database } from 'lucide-react';
import { Icon } from './Icon';

interface ChunkInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string | null;
  documentName: string | null;
}

export function ChunkInspector({ isOpen, onClose, documentId, documentName }: ChunkInspectorProps) {
  const [chunks, setChunks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && documentId) {
      setLoading(true);
      invoke<string[]>('get_document_chunks', { documentId })
        .then(setChunks)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setChunks([]);
    }
  }, [isOpen, documentId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
      <div className="w-[600px] h-full bg-forge-bg border-l border-forge-border flex flex-col shadow-2xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="h-16 border-b border-forge-border flex items-center justify-between px-6 bg-forge-surface/50 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-forge-text font-semibold flex items-center gap-2">
              <Icon icon={Database} size={18} className="text-forge-accent" />
              Chunk Inspector
            </h2>
            <span className="text-xs text-forge-text-muted font-mono truncate max-w-[400px]">
              {documentName}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-3 rounded-md transition-colors"
          >
            <Icon icon={X} size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-sm text-forge-text-muted">
              <Icon icon={Layers} size={16} />
              <span>{chunks.length} Extracted Chunks</span>
            </div>
            <span className="text-xs px-2 py-1 bg-forge-accent/10 text-forge-accent border border-forge-accent/20 rounded">
              SQLite Vector Store
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <span className="text-forge-text-muted animate-pulse font-mono text-sm">
                Retrieving vectors...
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {chunks.map((chunk, i) => (
                <div key={i} className="flex flex-col group">
                  <div className="text-[10px] text-forge-text-muted font-mono mb-1 ml-1 flex justify-between">
                    <span>CHUNK_{i.toString().padStart(4, '0')}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {chunk.length} chars
                    </span>
                  </div>
                  <div className="p-4 bg-forge-surface border border-forge-border rounded-lg text-sm text-forge-text font-mono leading-relaxed shadow-sm hover:border-forge-accent/30 transition-colors">
                    {chunk}
                  </div>
                </div>
              ))}
              
              {chunks.length === 0 && !loading && (
                <div className="text-center text-forge-text-muted mt-10 text-sm">
                  No chunks found for this document.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
