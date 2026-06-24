import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Database, Upload, Trash2, FileText, Search, Microscope, DatabaseZap } from 'lucide-react';
import { Icon } from './ui/Icon';
import { open } from '@tauri-apps/plugin-dialog';
import { ChunkInspector } from './ui/ChunkInspector';
import { Select } from './ui/Select';
import { GlassPanel } from './ui/GlassPanel';
import { NeonButton } from './ui/NeonButton';
import { motion, AnimatePresence } from 'framer-motion';
import { VectorGalaxy } from './VectorGalaxy';

interface RagDocument {
  id: string;
  filename: string;
  agent_id: string;
  uploaded_at: number;
  chunk_count: number;
}

export function KnowledgeView() {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [agents, setAgents] = useState<{value: string, label: string}[]>([{value: "global", label: "Global (Tüm Ajanlar)"}]);
  const [selectedAgent, setSelectedAgent] = useState<string>("global");
  
  const [inspectingDoc, setInspectingDoc] = useState<{ id: string, name: string } | null>(null);

  const fetchDocuments = async (agentId: string) => {
    setLoading(true);
    try {
      const docs = await invoke<RagDocument[]>('get_rag_documents', { agentId });
      setDocuments(docs);
    } catch (e) {
      console.error("Failed to load documents", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDocuments(selectedAgent);
    invoke<any[]>('get_agents').then(res => {
      setAgents([{value: "global", label: "Global (Tüm Ajanlar)"}, ...res.map(a => ({value: a.id, label: a.name}))]);
    }).catch(console.error);
  }, [selectedAgent]);

  const handleUpload = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Documents',
          extensions: ['txt', 'md', 'pdf']
        }]
      });
      
      if (selected && typeof selected === 'string') {
        setLoading(true);
        await invoke('ingest_document', { filePath: selected, agentId: selectedAgent });
        import('../store/toastStore').then(({ useToastStore }) => {
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Document Ingested',
            message: 'Document successfully parsed and chunked.'
          });
        });
        await fetchDocuments(selectedAgent);
      }
    } catch (e: any) {
      console.error(e);
      import('../store/toastStore').then(({ useToastStore }) => {
        useToastStore.getState().addToast({
          type: 'error',
          title: 'Ingestion Failed',
          message: e.message || e
        });
      });
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_rag_document', { id });
      setDocuments(prev => prev.filter(d => d.id !== id));
      import('../store/toastStore').then(({ useToastStore }) => {
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Deleted',
          message: 'Document removed from knowledge base.'
        });
      });
    } catch (e: any) {
      console.error(e);
    }
  };

  const filteredDocs = documents.filter(d => d.filename.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col p-8 bg-forge-bg text-forge-text overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-forge-accent via-forge-bg to-forge-bg" />
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-6 h-full relative z-10">
        <div className="shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forge-accent/10 border border-forge-accent rounded-xl flex items-center justify-center shadow-[0_0_15px_var(--forge-accent-muted)]">
              <Icon icon={DatabaseZap} size={24} className="text-forge-accent drop-shadow-[0_0_8px_var(--forge-accent)]" />
            </div>
            <div>
              <h1 className="text-3xl font-orbitron font-bold text-forge-text tracking-widest drop-shadow-[0_0_10px_var(--forge-text)] uppercase">KNOWLEDGE BASE</h1>
              <p className="text-forge-text-muted font-mono text-sm tracking-widest uppercase">Local Vector DB (RAG)</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Select 
              value={selectedAgent} 
              onChange={(val) => setSelectedAgent(val)}
              options={agents}
              className="w-64 font-mono uppercase tracking-widest"
            />
            <NeonButton 
              variant="accent"
              onClick={handleUpload}
              disabled={loading}
              className="py-3 px-6 text-sm tracking-widest"
            >
              <Icon icon={loading ? Microscope : Upload} size={16} className={loading ? "animate-pulse inline-block mr-2 -mt-0.5" : "inline-block mr-2 -mt-0.5"} />
              {loading ? "PROCESSING..." : "UPLOAD DATA"}
            </NeonButton>
          </div>
        </div>

        <div className="relative shrink-0">
          <Icon icon={Search} className="absolute left-4 top-1/2 -translate-y-1/2 text-forge-accent animate-pulse" size={20} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery((e.target as any).value)}
            placeholder="QUERY VECTOR DB..."
            className="w-full bg-forge-surface/50 border border-forge-border rounded-xl py-4 pl-12 pr-4 text-forge-text placeholder:text-forge-text-muted/50 font-mono tracking-widest outline-none focus:border-forge-accent focus:shadow-[0_0_15px_var(--forge-accent-muted)] transition-all shadow-inner"
          />
        </div>

        {filteredDocs.length > 0 && !loading && (
          <div className="shrink-0 h-64 mb-4">
            <VectorGalaxy agentId={selectedAgent} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2 pb-10">
          {loading ? (
            <GlassPanel className="flex flex-col items-center justify-center mt-10 p-12 border-dashed border-forge-accent/50 gap-6">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="w-24 h-24 relative flex items-center justify-center"
              >
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-forge-accent/40" />
                <Icon icon={Microscope} size={40} className="text-forge-accent drop-shadow-[0_0_10px_var(--forge-accent)]" />
              </motion.div>
              <div className="text-center">
                <p className="font-mono font-bold tracking-widest text-forge-text mb-2 uppercase text-lg">Parsing Data & Generating Embeddings</p>
                <p className="font-mono text-sm tracking-widest text-forge-text-muted uppercase">This may take several minutes depending on hardware.</p>
              </div>
            </GlassPanel>
          ) : filteredDocs.length === 0 ? (
            <GlassPanel intensity="low" className="flex flex-col items-center justify-center h-48 border-dashed border-forge-border-subtle text-forge-text-muted gap-4">
              <Icon icon={FileText} size={48} className="opacity-20" />
              <p className="font-mono tracking-widest uppercase opacity-50">NO DATA FOUND. AWAITING INGESTION.</p>
            </GlassPanel>
          ) : (
            <AnimatePresence>
              {filteredDocs.map((doc, idx) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <GlassPanel className="flex items-center justify-between p-4 transition-colors group hover:border-forge-accent/50 hover:shadow-[0_0_15px_var(--forge-accent-muted)] border-forge-border-subtle">
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className="p-3 bg-forge-accent/10 text-forge-accent rounded-lg shrink-0 border border-forge-accent/20">
                        <Icon icon={FileText} size={20} />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <h3 className="font-mono font-bold tracking-wider text-forge-text truncate">{doc.filename}</h3>
                        <p className="text-[10px] text-forge-text-muted truncate font-mono tracking-widest uppercase mt-0.5">
                          {new Date(doc.uploaded_at * 1000).toLocaleString()}
                        </p>
                        <div className="flex gap-2 mt-2">
                          {doc.agent_id && (
                            <span className="text-[9px] bg-forge-surface-2 px-2 py-0.5 rounded border border-forge-border font-mono uppercase tracking-widest text-forge-text-muted">
                              AGENT: {doc.agent_id}
                            </span>
                          )}
                          <span className="text-[9px] bg-forge-accent/10 px-2 py-0.5 rounded border border-forge-accent/30 font-mono uppercase tracking-widest text-forge-accent">
                            {doc.chunk_count} CHUNKS
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setInspectingDoc({ id: doc.id, name: doc.filename })}
                        className="p-2 text-forge-text-muted hover:text-forge-accent hover:bg-forge-accent/10 rounded-lg transition-colors border border-transparent hover:border-forge-accent/20 shrink-0"
                        title="Inspect Embeddings"
                      >
                        <Icon icon={Microscope} size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 text-forge-text-muted hover:text-forge-danger hover:bg-forge-danger/10 rounded-lg transition-colors border border-transparent hover:border-forge-danger/20 shrink-0"
                        title="Purge Data"
                      >
                        <Icon icon={Trash2} size={18} />
                      </button>
                    </div>
                  </GlassPanel>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
      
      <ChunkInspector 
        isOpen={!!inspectingDoc} 
        onClose={() => setInspectingDoc(null)} 
        documentId={inspectingDoc?.id || null}
        documentName={inspectingDoc?.name || null}
      />
    </div>
  );
}
