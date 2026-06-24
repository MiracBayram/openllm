import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, Download, Star, X, Filter, Trash2, Cpu, Box, Hexagon } from 'lucide-react';
import { Icon } from './ui/Icon';
import { Select } from './ui/Select';
import { useModelsStore } from '../store/models';
import { useConfigStore } from '../store/configStore';
import { useDownloadStore } from '../store/downloadStore';
import { motion } from 'framer-motion';
import { GlassPanel } from './ui/GlassPanel';
import { NeonButton } from './ui/NeonButton';

interface HubModel {
  model_id: string;
  downloads: number;
  likes: number;
  tags: string[];
}



export function HubView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HubModel[]>([]);
  const [loading, setLoading] = useState(false);
  const { activeDownloads, setActiveDownloads, removeDownload } = useDownloadStore();
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [formatFilter, setFormatFilter] = useState<'All' | 'GGUF' | 'AWQ' | 'Safetensors'>('All');
  const [activeTab, setActiveTab] = useState<'explore' | 'library'>('explore');
  const { models, scanModels } = useModelsStore();



  const cancelDownload = async (modelId: string, fileName: string) => {
    try {
      await invoke('cancel_download', { modelId }).catch(() => {});
      const dlKey = `${modelId}::${fileName}`;
      removeDownload(dlKey);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchModelFiles = async (modelId: string) => {
    if (expandedModel === modelId) {
      setExpandedModel(null);
      return;
    }
    setExpandedModel(modelId);
    setFilesLoading(true);
    setModelFiles([]);
    try {
      const res = await fetch(`https://huggingface.co/api/models/${modelId}`);
      if (!res.ok) throw new Error(`HF API error`);
      const data = await res.json();
      
      // Filter for quantizations or weights
      const validFiles = data.siblings?.filter((s: any) => {
        const lower = s.rfilename.toLowerCase();
        return lower.endsWith('.gguf') || lower.endsWith('.awq') || lower.endsWith('.safetensors');
      }).map((s: any) => ({
        ...s,
        sizeBytes: s.lfs?.size || 0
      })) || [];
      
      setModelFiles(validFiles);
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
    setFilesLoading(false);
  };

  const handleDownload = async (modelId: string, file: any) => {
    const fileName = file.rfilename;
    const dlKey = `${modelId}::${fileName}`;
    try {
      setActiveDownloads(prev => ({ ...prev, [dlKey]: { progress: 0, speed: 'Starting...', status: 'Initializing' } }));

      const expectedSha = file.lfs?.oid || "SKIP"; 
      await invoke('start_download', {
        modelId,
        fileName,
        expectedSha256: expectedSha
      });
    } catch (e: any) {
      setActiveDownloads(prev => ({ 
        ...prev, 
        [dlKey]: { progress: 0, speed: '', status: `Error: ${e.message || e}` } 
      }));
    }
  };



  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await invoke<HubModel[]>('search_hub_models', { query });
        setResults(res);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const handleDeleteModel = async (modelPath: string) => {
    try {
      await invoke('delete_model', { modelPath });
      import('../store/toastStore').then(({ useToastStore }) => {
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Model Deleted',
          message: `Successfully deleted model from disk.`
        });
      });
      const appConfig = useConfigStore.getState().config;
      if (appConfig?.storage.models_directory) {
        scanModels(appConfig.storage.models_directory);
      }
    } catch (e: any) {
      console.error(e);
      import('../store/toastStore').then(({ useToastStore }) => {
        useToastStore.getState().addToast({
          type: 'error',
          title: 'Delete Failed',
          message: e.message || e
        });
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-forge-bg text-forge-text overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-forge-accent via-forge-bg to-forge-bg" />
      <div className="max-w-6xl w-full mx-auto flex flex-col gap-6 h-full relative z-10">
        <div className="shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forge-accent/10 border border-forge-accent rounded-xl flex items-center justify-center shadow-[0_0_15px_var(--forge-accent-muted)]">
              <Icon icon={Box} size={24} className="text-forge-accent drop-shadow-[0_0_8px_var(--forge-accent)]" />
            </div>
            <div>
              <h1 className="text-3xl font-orbitron font-bold text-forge-text tracking-widest drop-shadow-[0_0_10px_var(--forge-text)]">MODEL GARDEN</h1>
              <p className="text-forge-text-muted font-mono text-sm tracking-widest uppercase">Neural Network Repository</p>
            </div>
          </div>
          <div className="flex p-1 rounded-xl border border-forge-border shrink-0 bg-forge-surface-2/50 backdrop-blur">
            <button 
              onClick={() => setActiveTab('explore')}
              className={`px-6 py-2 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${activeTab === 'explore' ? 'bg-forge-accent text-forge-bg font-bold shadow-[0_0_10px_var(--forge-accent)]' : 'text-forge-text-muted hover:text-forge-text'}`}
            >
              Explore Hub
            </button>
            <button 
              onClick={() => setActiveTab('library')}
              className={`px-6 py-2 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${activeTab === 'library' ? 'bg-forge-accent text-forge-bg font-bold shadow-[0_0_10px_var(--forge-accent)]' : 'text-forge-text-muted hover:text-forge-text'}`}
            >
              My Library
            </button>
          </div>
        </div>

        {activeTab === 'explore' ? (
          <>
            <form onSubmit={(e) => e.preventDefault()} className="flex gap-4 shrink-0">
          <div className="relative flex-1">
            <Icon icon={Search} className="absolute left-4 top-1/2 -translate-y-1/2 text-forge-accent animate-pulse" size={20} />
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery((e.target as any).value)}
              placeholder="QUERY REGISTRY (e.g. Llama-3-8B-Instruct-GGUF)"
              className="w-full bg-forge-surface/50 border border-forge-border rounded-xl py-4 pl-12 pr-4 text-forge-text placeholder:text-forge-text-muted/50 font-mono tracking-widest outline-none focus:border-forge-accent focus:shadow-[0_0_15px_var(--forge-accent-muted)] transition-all shadow-inner"
            />
          </div>
        </form>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-2 pb-10">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <GlassPanel key={i} className="flex flex-col rounded-xl p-5 animate-pulse border-forge-border-subtle">
                  <div className="flex justify-between items-start">
                    <div className="h-6 bg-forge-border rounded w-1/3"></div>
                    <div className="flex gap-2">
                      <div className="h-6 w-16 bg-forge-border rounded"></div>
                      <div className="h-6 w-16 bg-forge-border rounded"></div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <div className="h-4 bg-forge-border rounded w-16"></div>
                    <div className="h-4 bg-forge-border rounded w-20"></div>
                    <div className="h-4 bg-forge-border rounded w-12"></div>
                  </div>
                </GlassPanel>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((model, i) => (
                <motion.div 
                  key={i}
                  whileHover={{ scale: 1.02, y: -5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="flex flex-col"
                >
                  <GlassPanel className="flex flex-col rounded-xl overflow-hidden transition-all duration-300 border-forge-border-subtle hover:border-forge-accent hover:shadow-[0_0_20px_var(--forge-accent-muted)] group">
                    {/* Card Header (Clickable) */}
                    <div 
                      className="p-5 flex flex-col gap-3 cursor-pointer"
                      onClick={() => fetchModelFiles(model.model_id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 max-w-[65%]">
                          <Icon icon={Cpu} size={16} className="text-forge-accent group-hover:animate-spin-slow shrink-0" />
                          <h3 className="text-lg font-bold text-forge-text font-mono truncate">{model.model_id}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-forge-text-muted font-mono tracking-widest bg-forge-surface-2/80 px-3 py-1.5 rounded border border-forge-border">
                          <span className="flex items-center gap-1.5 text-forge-success"><Icon icon={Download} size={14} /> {model.downloads.toLocaleString()}</span>
                          <span className="flex items-center gap-1.5 text-forge-warning"><Icon icon={Star} size={14} /> {model.likes.toLocaleString()}</span>
                        </div>
                      </div>
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {model.tags && model.tags.length > 0 && (
                          <>
                            {model.tags.slice(0, 4).map((tag, idx) => (
                              <span key={idx} className="text-[9px] px-2 py-0.5 rounded bg-forge-surface-3 text-forge-accent font-mono tracking-widest uppercase border border-forge-border">
                                {tag}
                              </span>
                            ))}
                            {model.tags.length > 4 && (
                              <span className="text-[9px] px-2 py-0.5 rounded bg-forge-surface-3 text-forge-accent font-mono tracking-widest uppercase border border-forge-border">
                                +{model.tags.length - 4}
                              </span>
                            )}
                          </>
                        )}
                      </div>

                {/* Active Download Progress (if any) */}
                {Object.entries(activeDownloads)
                  .filter(([k]) => k.startsWith(`${model.model_id}::`))
                  .map(([dlKey, dlState]) => {
                    const fileName = dlKey.split('::')[1];
                    return (
                      <div key={dlKey} className="mt-2 p-3 bg-forge-bg rounded-lg border border-forge-border flex flex-col gap-1 w-full text-xs">
                        <div className="flex justify-between text-forge-text-secondary mb-1 font-mono">
                          <span className="truncate mr-2">{fileName}</span>
                          <span>{dlState.status}</span>
                          <span className="text-forge-accent shrink-0 ml-2">{dlState.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-forge-surface rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${dlState.status.includes('Error') ? 'bg-forge-danger' : 'bg-forge-accent'}`}
                            style={{ width: `${dlState.progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          {dlState.speed && (
                            <span className="text-forge-text-muted text-[10px]">{dlState.speed}</span>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); cancelDownload(model.model_id, fileName); }}
                            className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <Icon icon={X} size={12} /> Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Files Accordion (Quantizations) */}
              {expandedModel === model.model_id && (
                <div className="bg-forge-bg border-t border-forge-border p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-forge-text-muted uppercase tracking-widest flex items-center gap-2">
                      Available Files
                    </h4>
                    <div className="flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <Icon icon={Filter} size={12} className="text-forge-text-muted" />
                      <Select 
                        value={formatFilter} 
                        onChange={(val) => setFormatFilter(val as any)}
                        options={[
                          { value: 'All', label: 'All Formats' },
                          { value: 'GGUF', label: 'GGUF Only' },
                          { value: 'AWQ', label: 'AWQ Only' },
                          { value: 'Safetensors', label: 'Safetensors' }
                        ]}
                        className="w-36"
                      />
                    </div>
                  </div>
                  {filesLoading ? (
                    <div className="text-sm text-forge-text-muted animate-pulse p-4 text-center">Scanning repository for weights...</div>
                  ) : modelFiles.length === 0 ? (
                    <div className="text-sm text-forge-danger bg-forge-danger-bg p-3 rounded-lg border border-forge-danger/20 text-center">
                      No GGUF, AWQ, or Safetensors files found. (Might be raw PyTorch format)
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                      {modelFiles.filter(f => formatFilter === 'All' || f.rfilename.toLowerCase().endsWith(formatFilter.toLowerCase())).map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-forge-surface/50 hover:bg-forge-surface p-3 rounded-lg border border-forge-border/50 group transition-colors">
                          <div className="flex flex-col gap-1 overflow-hidden mr-4">
                            <span className="font-mono text-sm text-forge-text/90 truncate">
                              {file.rfilename}
                            </span>
                            {file.sizeBytes > 0 && (
                              <span className="text-[10px] text-forge-text-muted">
                                {(file.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB
                              </span>
                            )}
                          </div>
                          
                          {(() => {
                            const isDownloaded = models.some(m => m.path.includes(file.rfilename));
                            const dlKey = `${model.model_id}::${file.rfilename}`;
                            const isDownloading = !!activeDownloads[dlKey] && !activeDownloads[dlKey].status.includes('Completed') && !activeDownloads[dlKey].status.includes('Error');
                            
                            if (isDownloaded) {
                              return (
                                <button disabled className="shrink-0 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded text-xs font-medium cursor-default flex items-center gap-2">
                                  ✓ İndirildi
                                </button>
                              );
                            }
                            
                            if (isDownloading) {
                              return (
                                <button disabled className="shrink-0 bg-forge-accent/20 border border-forge-accent/30 text-forge-accent px-4 py-1.5 rounded text-xs font-medium cursor-default flex items-center gap-2">
                                  İndiriliyor...
                                </button>
                              );
                            }
                            
                            return (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDownload(model.model_id, file); }}
                                className="shrink-0 bg-forge-bg hover:bg-forge-accent hover:text-white border border-forge-border text-forge-text-secondary px-4 py-1.5 rounded text-xs font-medium transition-all shadow-sm flex items-center gap-2"
                              >
                                <Icon icon={Download} size={14} /> Download
                              </button>
                            );
                          })()}
                        </div>
                      ))}
                      {modelFiles.filter(f => formatFilter === 'All' || f.rfilename.toLowerCase().endsWith(formatFilter.toLowerCase())).length === 0 && (
                        <div className="text-center text-forge-text-muted text-xs p-4">
                          No files matching {formatFilter} format.
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )}
                </GlassPanel>
              </motion.div>
              ))}
            </div>
          )}
          {results.length === 0 && query.length > 2 && !loading && (
            <div className="text-center text-forge-text-muted mt-10 font-mono tracking-widest uppercase opacity-50">NO MODELS FOUND FOR "{query}"</div>
          )}
        </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-2 pb-10">
            {models.length === 0 ? (
              <div className="text-center text-forge-text-muted mt-10 font-mono tracking-widest uppercase opacity-50">
                LIBRARY EMPTY. ACQUIRE NEURAL NETWORKS FROM EXPLORE TAB.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {models.map((model, i) => (
                  <motion.div 
                    key={i}
                    whileHover={{ scale: 1.02, y: -5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <GlassPanel className="flex flex-col rounded-xl p-5 transition-all duration-300 border-forge-border-subtle hover:border-forge-accent hover:shadow-[0_0_20px_var(--forge-accent-muted)] group h-full">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1 max-w-[80%]">
                          <div className="flex items-center gap-2">
                            <Icon icon={Cpu} size={16} className="text-forge-accent group-hover:animate-pulse" />
                            <h3 className="text-lg font-bold text-forge-text font-mono truncate">{model.name}</h3>
                          </div>
                          <p className="text-[10px] text-forge-text-muted font-mono tracking-wider truncate opacity-70">{model.path}</p>
                        </div>
                        <button 
                          onClick={() => { if (window.confirm('Delete this neural network from local storage?')) handleDeleteModel(model.path); }}
                          className="p-2 text-forge-danger bg-forge-danger/10 hover:bg-forge-danger hover:text-white rounded transition-colors border border-forge-danger/20"
                          title="Purge Model"
                        >
                          <Icon icon={Trash2} size={16} />
                        </button>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mt-auto pt-6 text-[10px] font-mono font-bold tracking-widest uppercase">
                        <div className="flex items-center gap-1.5 bg-forge-surface-2 px-2.5 py-1 rounded border border-forge-border shadow-inner">
                          <span className="text-forge-text-muted">SIZE:</span>
                          <span className="text-forge-accent">{(model.size_mb / 1024).toFixed(2)} GB</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-forge-surface-2 px-2.5 py-1 rounded border border-forge-border shadow-inner">
                          <span className="text-forge-text-muted">ARCH:</span>
                          <span className="text-forge-warning">{model.architecture}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-forge-surface-2 px-2.5 py-1 rounded border border-forge-border shadow-inner">
                          <span className="text-forge-text-muted">QUANT:</span>
                          <span className="text-forge-success">{model.quant_label}</span>
                        </div>
                      </div>
                    </GlassPanel>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
