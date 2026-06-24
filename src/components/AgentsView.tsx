import { Bot, Plus, Settings, UploadCloud, FileText } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useUiStore } from '../store/uiStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

interface RagDocument {
  id: string;
  filename: string;
  agent_id: string;
  uploaded_at: number;
  chunk_count: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  status: string;
}

export function AgentsView() {
  const { setSystemPromptModalOpen } = useUiStore();
  const [isIngesting, setIsIngesting] = useState(false);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fetchAgents = async () => {
    try {
      const result = await invoke<Agent[]>('get_agents');
      setAgents(result);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const docs = await invoke<RagDocument[]>('get_rag_documents', { agentId: "global" });
      setDocuments(docs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchAgents();
    
    const handleUpdate = () => fetchAgents();
    window.addEventListener('agent-updated', handleUpdate);
    
    let unlistenHover: any;
    let unlistenCancelled: any;
    let unlistenDrop: any;
    
    const setupDrag = async () => {
      unlistenHover = await listen('tauri://file-drop-hover', () => setIsDragging(true));
      unlistenCancelled = await listen('tauri://file-drop-cancelled', () => setIsDragging(false));
      unlistenDrop = await listen<{ paths: string[] }>('tauri://file-drop', async (e) => {
        setIsDragging(false);
        const paths = e.payload?.paths;
        if (paths && paths.length > 0) {
          const file = paths[0];
          if (file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.txt')) {
            setIsIngesting(true);
            try {
              await invoke('ingest_document', { filePath: file, agentId: "global" });
              await fetchDocuments();
            } catch (err) {
              console.error("Ingest failed:", err);
            }
            setIsIngesting(false);
          }
        }
      });
    };
    setupDrag();

    return () => {
      window.removeEventListener('agent-updated', handleUpdate);
      if (unlistenHover) unlistenHover();
      if (unlistenCancelled) unlistenCancelled();
      if (unlistenDrop) unlistenDrop();
    };
  }, []);

  const handleCreateAgent = async () => {
    if (!newAgentName) return;
    try {
      await invoke('create_agent', {
        name: newAgentName,
        description: newAgentDesc,
        systemPrompt: newAgentPrompt
      });
      setIsModalOpen(false);
      setNewAgentName('');
      setNewAgentDesc('');
      setNewAgentPrompt('');
      await fetchAgents();
    } catch (e) {
      console.error("Failed to create agent", e);
    }
  };

  const handleDeleteAgent = async (e: any, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this agent?")) {
      await invoke('delete_agent', { id });
      await fetchAgents();
    }
  };

  return (
    <div className="flex-1 p-8 bg-forge-bg text-forge-text overflow-y-auto">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold mb-2 flex items-center gap-2">
              <Icon icon={Bot} className="text-forge-accent" />
              Autonomous Agents
            </h1>
            <p className="text-forge-text/70">Manage your local RAG and automation agents.</p>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-forge-accent hover:brightness-110 px-4 py-2 rounded-lg font-semibold shadow-lg">
            <Icon icon={Plus} size={18} />
            New Agent
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-forge-surface border border-forge-border rounded-xl p-6 flex flex-col gap-4 hover:border-forge-accent/50 transition-colors cursor-pointer group">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-forge-accent/10 border border-forge-accent/20 flex items-center justify-center">
                    <Icon icon={Bot} className="text-forge-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{agent.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-emerald-400' : 'bg-forge-text-muted'}`} />
                      <span className="text-xs text-forge-text-muted capitalize">{agent.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSystemPromptModalOpen(true, agent.id, agent.system_prompt);
                    }}
                    className="text-forge-text-muted hover:text-forge-text p-1"
                    title="Agent Settings"
                  >
                    <Icon icon={Settings} size={18} />
                  </button>
                  <button 
                    onClick={(e) => handleDeleteAgent(e, agent.id)}
                    className="text-forge-text-muted hover:text-red-400 p-1"
                    title="Delete Agent"
                  >
                    <Icon icon={Plus} size={18} className="rotate-45" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-forge-text/80 leading-relaxed">
                {agent.description}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 border-t border-forge-border pt-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Icon icon={UploadCloud} className="text-forge-accent" />
            Knowledge Base
          </h2>
          <p className="text-forge-text/70 mb-4 text-sm">
            Drag and drop PDF or TXT files here to add them to your local vector database (RAG).
          </p>
          
          <div 
            onClick={async () => {
              try {
                const file = await open({
                  multiple: false,
                  filters: [{ name: 'Documents', extensions: ['pdf', 'txt'] }]
                });
                
                if (file && typeof file === 'string') {
                  setIsIngesting(true);
                  await invoke('ingest_document', { filePath: file, agentId: "global" });
                  await fetchDocuments();
                  setIsIngesting(false);
                }
              } catch (e) {
                console.error("Ingest failed:", e);
                setIsIngesting(false);
              }
            }}
            className={`border-2 border-dashed border-forge-border rounded-xl p-12 flex flex-col items-center justify-center text-forge-text-muted hover:border-forge-accent/50 hover:bg-forge-surface/30 transition-colors cursor-pointer group ${isIngesting ? 'opacity-50 pointer-events-none' : ''} ${isDragging ? 'border-forge-accent bg-forge-accent/10 text-forge-accent' : ''}`}
          >
            {isIngesting ? (
              <>
                <div className="w-12 h-12 rounded-full border-t-2 border-forge-accent animate-spin mb-4" />
                <p className="font-semibold text-lg text-forge-accent">Processing Document...</p>
                <p className="text-sm mt-2 text-forge-text-muted">Extracting text and generating chunks</p>
              </>
            ) : (
              <>
                <Icon icon={UploadCloud} size={48} className="mb-4 group-hover:text-forge-accent transition-colors" />
                <p className="font-semibold text-lg text-forge-text group-hover:text-forge-accent">Drop documents here</p>
                <p className="text-sm mt-2">or click to browse</p>
              </>
            )}
          </div>

          {/* Uploaded Files Mock */}
          <div className="mt-6 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-forge-text-muted mb-2">INDEXED DOCUMENTS</h3>
            {documents.map((doc) => (
              <div key={doc.id} className="bg-forge-surface border border-forge-border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon icon={FileText} className="text-forge-accent" />
                  <div>
                    <p className="font-semibold text-sm">{doc.filename}</p>
                    <div className="flex gap-2">
                      <p className="text-xs text-forge-text-muted">Uploaded: {new Date(doc.uploaded_at * 1000).toLocaleString()}</p>
                      <p className="text-xs text-forge-accent">{doc.chunk_count} Chunks</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    if (window.confirm('Bu dokümanı silmek istediğinize emin misiniz?')) {
                      await invoke('delete_rag_document', { id: doc.id });
                      fetchDocuments();
                    }
                  }}
                  className="text-forge-danger hover:text-red-400 text-xs font-semibold px-2 py-1 bg-forge-danger/10 rounded"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div className="bg-forge-bg border border-forge-border rounded-xl shadow-2xl p-6 w-full max-w-lg animate-slide-down flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-forge-text flex items-center gap-2">
              <Icon icon={Plus} /> Create New Agent
            </h2>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-forge-text-muted uppercase tracking-widest">Agent Name</label>
              <input 
                value={newAgentName}
                onChange={(e: any) => setNewAgentName(e.target.value)}
                placeholder="e.g. Code Reviewer"
                className="bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-forge-text outline-none focus:border-forge-accent"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-forge-text-muted uppercase tracking-widest">Description</label>
              <input 
                value={newAgentDesc}
                onChange={(e: any) => setNewAgentDesc(e.target.value)}
                placeholder="What does this agent do?"
                className="bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-forge-text outline-none focus:border-forge-accent"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-forge-text-muted uppercase tracking-widest">System Prompt</label>
              <textarea 
                value={newAgentPrompt}
                onChange={(e: any) => setNewAgentPrompt(e.target.value)}
                placeholder="You are an expert in..."
                className="bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-forge-text outline-none focus:border-forge-accent resize-none h-32"
              />
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg text-forge-text-muted hover:text-forge-text hover:bg-forge-surface transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateAgent}
                disabled={!newAgentName}
                className="px-4 py-2 bg-forge-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-all font-semibold shadow-lg"
              >
                Create Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
