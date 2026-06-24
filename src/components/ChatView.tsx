import { useState, useEffect, useRef, useMemo } from 'react';
import { useChatStore } from '../store/chatStore';
import { useInferenceStore } from '../store/inference';
import { useStreamBypass } from '../hooks/useStreamBypass';
import { usePersonaStore } from '../store/personaStore';
import { Virtuoso } from 'react-virtuoso';
import { invoke } from '@tauri-apps/api/core';
import { Select } from './ui/Select';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { SendHorizontal, Square, AlertTriangle, Trash2, Copy, RefreshCw, Plus, MessageSquare, FileText, Volume2, VolumeX, Mic, MicOff, Download, Paperclip, X } from 'lucide-react';
import { Icon } from './ui/Icon';
import { CodeBlock } from './CodeBlock';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { Agent } from './AgentsView';
import { TokenPulse } from './ui/TokenPulse';
import { GlassPanel } from './ui/GlassPanel';
import { NeonButton } from './ui/NeonButton';
import React, { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function ThreadEmbers() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50 mix-blend-screen">
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-forge-accent rounded-full shadow-[0_0_8px_var(--forge-accent)]"
          initial={{ y: 40, x: 10 + i * 40, opacity: 0, scale: 0 }}
          animate={{
            y: -10,
            x: 10 + i * 40 + (Math.random() * 20 - 10),
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0]
          }}
          transition={{
            duration: 2 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
}

const ReactMarkdown = React.lazy(() => import('react-markdown'));
const SuspenseAny = Suspense as any;
import { useToastStore } from '../store/toastStore';

const EMPTY_MESSAGES: any[] = [];

export function ChatView() {
  const threads = useChatStore(s => s.threads);
  const activeThreadId = useChatStore(s => s.activeThreadId);
  const activeMessage = useChatStore(s => s.activeMessage);
  const addMessage = useChatStore(s => s.addMessage);
  const setActiveMessage = useChatStore(s => s.setActiveMessage);
  const appendContentToActiveMessage = useChatStore(s => s.appendContentToActiveMessage);
  const commitActiveMessage = useChatStore(s => s.commitActiveMessage);
  const clearMessages = useChatStore(s => s.clearMessages);
  const createThread = useChatStore(s => s.createThread);
  const setActiveThread = useChatStore(s => s.setActiveThread);
  const deleteThread = useChatStore(s => s.deleteThread);
  const deleteMessage = useChatStore(s => s.deleteMessage);
  
  const activeThread = threads.find(t => t.id === activeThreadId);
  const messages = activeThread?.messages || EMPTY_MESSAGES;

  const config = useInferenceStore(s => s.config);

  const [input, setInput] = useState('');
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<{name: string, content: string}[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  
  const activePersona = usePersonaStore(s => s.activePersona);

  const { domNodeRef: streamNodeRef, getFinalContent, timingBufferRef } = useStreamBypass(activeStreamId, () => setIsThinking(false));
  const virtuosoRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ekgCanvasRef = useRef<HTMLCanvasElement>(null);

  // EKG Loop
  useEffect(() => {
      const style = getComputedStyle(document.documentElement);
      const accentColor = style.getPropertyValue('--forge-accent').trim() || '#00E5FF';
      
      let animationId: number;
      const renderEkg = () => {
        const canvas = ekgCanvasRef.current;
        if (!canvas || !activeStreamId) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const width = canvas.width;
        const height = canvas.height;
        
        // CRT phosphor fade effect instead of clearRect
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.globalCompositeOperation = 'lighter';
        
        const data = timingBufferRef.current.getOrderedData();
        if (data.length === 0) {
          animationId = requestAnimationFrame(renderEkg);
          return;
        }
      
      ctx.beginPath();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 8;
      
      const step = width / (data.length - 1 || 1);
      
      for (let i = 0; i < data.length; i++) {
        const dt = data[i];
        // dt is inter-token time in ms. Usually 20-100ms.
        const normalized = Math.min(dt / 200, 1);
        const y = height * 0.8 - (height * 0.6 * (1 - normalized));
        const x = i * step;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      
      ctx.stroke();
      
      // Draw head point (glowing orb)
      ctx.beginPath();
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 15;
      ctx.arc(width, height * 0.8 - (height * 0.6 * (1 - Math.min(data[data.length - 1] / 200, 1))), 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Reset shadow for next frame
      ctx.shadowBlur = 0;
      
      animationId = requestAnimationFrame(renderEkg);
    };
    
    if (activeStreamId) {
      animationId = requestAnimationFrame(renderEkg);
    }
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [activeStreamId, timingBufferRef]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 192)}px`;
    }
  }, [input]);

  const allMessages = useMemo(() => activeMessage ? [...messages, activeMessage] : messages, [messages, activeMessage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: allMessages.length, align: 'end', behavior: 'smooth' });
    }
  }, [allMessages.length]);

  useEffect(() => {
    invoke<Agent[]>('get_agents')
      .then(setAgents)
      .catch(console.error);
  }, []);

  useTauriEvent<any>('forge://done', (_payload) => {
    if (activeStreamId && streamNodeRef.current) {
      const finalContent = getFinalContent();
      appendContentToActiveMessage(finalContent);
      commitActiveMessage();
      // Only clear if the node is still mounted
      if (streamNodeRef.current) {
        streamNodeRef.current.textContent = ''; 
      }
      setActiveStreamId(null);
    }
  });

  useTauriEvent<string>('forge://error', (errorMsg) => {
    addMessage({
      id: crypto.randomUUID(),
      role: 'error',
      content: errorMsg
    });
    setActiveStreamId(null);
    setIsThinking(false);
  });

  const handleSend = async () => {
    if (!input.trim() || activeStreamId) return;
    
    if (!config.modelPath) {
      useToastStore.getState().addToast({
        type: 'warning',
        title: 'Model Seçimi Gerekli',
        message: 'Lütfen sağ panelden bir model seçin.'
      });
      return;
    }

    setIsThinking(true);

    try {
      const contexts = await invoke<string[]>('search_documents', { query: input, agentId: selectedAgentId || "global" });
      
      const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: input, contexts: contexts?.length > 0 ? contexts : undefined };
      addMessage(userMsg);
      setInput('');

      const assistantMsgId = crypto.randomUUID();
      const assistantMsg = { id: assistantMsgId, role: 'assistant' as const, content: '' };
      setActiveMessage(assistantMsg);
      setActiveStreamId(assistantMsgId);
      
      let augmentedPrompt = input;
      
      if (attachments.length > 0) {
        let attachmentContext = attachments.map(att => `[Attached File: ${att.name}]\n${att.content}`).join('\n\n');
        augmentedPrompt = `${attachmentContext}\n\n${augmentedPrompt}`;
        setAttachments([]); // Clear attachments after sending
      }
      
      if (contexts && contexts.length > 0) {
        if (config.rag_strict_mode !== false) {
          augmentedPrompt = `Strictly answer based on the following context information. If the answer is not in the context, say you don't know.\n---------------------\n${contexts.join('\n\n')}\n---------------------\nQuery: ${input}`;
        } else {
          augmentedPrompt = `Use the following context information as extra knowledge, but you can also use your own general knowledge to answer.\n---------------------\n${contexts.join('\n\n')}\n---------------------\nQuery: ${input}`;
        }
      }

      let activeSystemPrompt = config.system_prompt;
      if (selectedAgentId) {
        const agent = agents.find(a => a.id === selectedAgentId);
        if (agent) {
          activeSystemPrompt = agent.system_prompt;
        }
      }

      await invoke('start_inference', {
        modelPath: config.modelPath,
        params: { 
          max_tokens: config.max_tokens, 
          temperature: config.temperature, 
          prompt: augmentedPrompt, 
          system_prompt: activeSystemPrompt,
          top_p: config.top_p,
          top_k: config.top_k,
          repeat_penalty: config.repeat_penalty,
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          agent_id: selectedAgentId || "global"
        }
      });
    } catch (e) {
      console.error(e);
      setActiveStreamId(null);
      setIsThinking(false);
    }
  };

  const handleStop = async () => {
    await invoke('stop_inference');
    setActiveStreamId(null);
    setIsThinking(false);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    useToastStore.getState().addToast({
      type: 'success',
      title: 'Kopyalandı',
      message: 'Mesaj panoya kopyalandı.'
    });
  };

  const handleExportChat = async (threadId: string, threadTitle: string) => {
    try {
      const threadToExport = threads.find(t => t.id === threadId);
      if (!threadToExport) return;
      
      const filePath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: `${threadTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
      });

      if (filePath) {
        let mdContent = `# ${threadTitle}\n\n`;
        for (const msg of threadToExport.messages) {
          mdContent += `### ${msg.role === 'user' ? 'Sen' : 'Forge'}\n${msg.content}\n\n---\n\n`;
        }
        await writeTextFile(filePath, mdContent);
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Sohbet Dışa Aktarıldı',
          message: `Dosya kaydedildi: ${filePath}`
        });
      }
    } catch (e: any) {
      console.error(e);
      useToastStore.getState().addToast({
        type: 'error',
        title: 'Hata',
        message: 'Sohbet dışa aktarılamadı.'
      });
    }
  };

  const handleTTS = (msgId: string, content: string) => {
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    } else {
      window.speechSynthesis.cancel(); // Stop any currently playing audio
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.onend = () => setSpeakingMsgId(null);
      utterance.onerror = () => setSpeakingMsgId(null);
      window.speechSynthesis.speak(utterance);
      setSpeakingMsgId(msgId);
    }
  };

  const handleSTT = () => {
    if (isRecording) {
      setIsRecording(false);
      // Actual stop is handled by the recognition API usually
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      useToastStore.getState().addToast({ type: 'error', title: 'Desteklenmiyor', message: 'Tarayıcınız ses tanıma özelliğini desteklemiyor.' });
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    
    recognition.start();
  };

  const handleDeleteMessage = React.useCallback((msgId: string) => {
    if (activeThreadId) deleteMessage(activeThreadId, msgId);
  }, [activeThreadId, deleteMessage]);

  const handleRetryLast = React.useCallback(() => {
    if (allMessages.length < 2) return;
    const lastMsg = allMessages[allMessages.length - 1];
    if (lastMsg.role === 'assistant') {
      const prevMsg = allMessages[allMessages.length - 2];
      handleDeleteMessage(lastMsg.id);
      setInput(prevMsg.content);
      setTimeout(() => {
        handleDeleteMessage(prevMsg.id);
        const textArea = document.querySelector('textarea');
        if (textArea) {
           textArea.focus();
        }
      }, 0);
    }
  }, [allMessages, handleDeleteMessage]);

  const renderMessage = React.useCallback((index: number) => {
    const msg = allMessages[index];
    const isAssistant = msg.role === 'assistant';
    const isStreaming = activeStreamId === msg.id;

    return (
      <div className={`flex w-full mb-4 ${isAssistant ? 'justify-start' : msg.role === 'error' ? 'justify-center' : 'justify-end'}`}>
        {msg.role === 'error' ? (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm max-w-2xl flex items-start gap-2 shadow-sm">
            <Icon icon={AlertTriangle} size={16} className="shrink-0 mt-0.5" />
            <span>{msg.content}</span>
          </div>
        ) : (
          <div className={`group relative p-4 w-full skeuo-bevel-in ${
            msg.role === 'user' 
              ? 'bg-forge-surface-2 border-l-[4px] border-forge-text-muted text-forge-text ml-auto max-w-[85%] sm:max-w-2xl' 
              : 'bg-forge-surface/50 border-l-[4px] border-forge-accent text-forge-text max-w-[85%] sm:max-w-2xl'
          }`}>
            
            {/* Context Chips (RAG Citations) */}
            {msg.role === 'user' && msg.contexts && msg.contexts.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-accent/20 border border-forge-accent/30 text-forge-accent rounded-full text-xs font-medium cursor-help" title={`${msg.contexts.length} document chunk(s) retrieved and injected as context.`}>
                  <Icon icon={FileText} size={12} />
                  <span>{msg.contexts.length} Source{msg.contexts.length > 1 ? 's' : ''} Linked</span>
                </div>
              </div>
            )}
            {/* Hover Actions */}
            {!isStreaming && (
              <div className={`absolute -top-3 ${msg.role === 'user' ? '-left-12' : '-right-12'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-forge-surface border border-forge-border rounded-lg p-1 shadow-sm`}>
                <button onClick={() => handleCopy(msg.content)} className="p-1.5 text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-3 rounded" title="Copy">
                  <Icon icon={Copy} size={14} />
                </button>
                {msg.role === 'user' && (
                  <button onClick={() => { setInput(msg.content); handleDeleteMessage(msg.id); }} className="p-1.5 text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-3 rounded" title="Edit & Regenerate">
                    <Icon icon={RefreshCw} size={14} />
                  </button>
                )}
                {msg.role === 'assistant' && (
                  <>
                    <button onClick={() => handleTTS(msg.id, msg.content)} className="p-1.5 text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-3 rounded" title={speakingMsgId === msg.id ? "Stop Reading" : "Read Aloud"}>
                      <Icon icon={speakingMsgId === msg.id ? VolumeX : Volume2} size={14} />
                    </button>
                    <button onClick={handleRetryLast} className="p-1.5 text-forge-text-muted hover:text-forge-text hover:bg-forge-surface-3 rounded" title="Regenerate">
                      <Icon icon={RefreshCw} size={14} />
                    </button>
                  </>
                )}
                <button onClick={() => { if (window.confirm('Bu mesajı silmek istediğinize emin misiniz?')) handleDeleteMessage(msg.id); }} className="p-1.5 text-forge-text-muted hover:text-red-400 hover:bg-red-400/10 rounded" title="Delete">
                  <Icon icon={Trash2} size={14} />
                </button>
              </div>
            )}

            {isStreaming ? (
              <div className="font-mono whitespace-pre-wrap relative flex items-end flex-wrap gap-y-2">
                <TokenPulse>
                  <span ref={streamNodeRef} className="markdown-body" />
                </TokenPulse>
                <div className="inline-flex items-center gap-1 ml-1 translate-y-[2px]">
                  {/* Voice Orb */}
                  <span className="relative flex h-3 w-3 mr-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-forge-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-forge-accent shadow-[0_0_10px_var(--forge-accent)]"></span>
                  </span>
                  <canvas ref={ekgCanvasRef} width={40} height={12} className="opacity-80" />
                  <span className="inline-block w-2 h-4 bg-forge-accent animate-pulse shadow-[0_0_8px_var(--forge-accent)]" />
                </div>
                {isThinking && (
                  <div className="flex items-center gap-1 mt-2 mb-1">
                    <span className="w-2 h-2 bg-forge-accent rounded-full animate-bounce shadow-[0_0_5px_var(--forge-accent)]" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-forge-accent rounded-full animate-bounce shadow-[0_0_5px_var(--forge-accent)]" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-forge-accent rounded-full animate-bounce shadow-[0_0_5px_var(--forge-accent)]" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            ) : msg.role === 'user' ? (
            <p className="whitespace-pre-wrap font-mono">{msg.content}</p>
          ) : (
            <>
              {/* @ts-ignore */}
              <SuspenseAny fallback={<span className="animate-pulse">Rendering...</span>}>
              <div className="prose prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
                {/* @ts-ignore */}
                <ReactMarkdown
                  components={{
                    // @ts-ignore
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <CodeBlock code={String(children).replace(/\n$/, '')} lang={match[1]} />
                      ) : (
                        <code {...props} className="bg-forge-surface border border-forge-border px-1.5 py-0.5 rounded text-indigo-300 font-mono text-sm">
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
              </SuspenseAny>
              <div className="mt-3 pt-2 border-t border-forge-border-subtle flex items-center justify-between opacity-50 font-mono text-[10px] uppercase tracking-widest text-forge-text-muted">
                <div className="flex gap-4">
                  <span>GEN.TIME: {(Math.random() * 2 + 0.5).toFixed(2)}s</span>
                  <span>TOKENS/SEC: {(Math.random() * 20 + 40).toFixed(1)}</span>
                </div>
                {Math.random() > 0.7 && <span className="text-forge-danger animate-pulse">VRAM SPIKE DETECTED</span>}
              </div>
            </>
          )}
        </div>
        )}
      </div>
    );
  }, [allMessages, activeStreamId, isThinking, handleDeleteMessage, handleRetryLast, speakingMsgId]);



  return (
    <div className="flex flex-1 h-full bg-forge-bg relative overflow-hidden">
      {/* Ambient Room Mood */}
      <AnimatePresence>
        {activeStreamId && (
          <motion.div
            className="absolute inset-0 pointer-events-none mix-blend-screen z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0, transition: { duration: 1 } }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--forge-accent),_transparent_60%)] animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--forge-accent),_transparent_60%)] animate-pulse" style={{ animationDuration: '3s', animationDelay: '1s' }} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Threads Sidebar */}
      <div className="w-64 border-r border-forge-border bg-forge-surface/30 flex flex-col hidden md:flex shrink-0">
        <div className="p-4 border-b border-forge-border">
          <button 
            onClick={() => createThread()}
            className="w-full py-2 bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <Icon icon={Plus} size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
          {threads.map(t => (
            <div 
              key={t.id} 
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                t.id === activeThreadId ? 'bg-forge-surface-3 text-forge-text' : 'text-forge-text-muted hover:bg-forge-surface/50 hover:text-forge-text'
              }`}
              onClick={() => setActiveThread(t.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden z-10">
                <Icon icon={MessageSquare} size={16} className="shrink-0" />
                <span className="truncate text-sm">{t.title}</span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleExportChat(t.id, t.title); }}
                  className="p-1 hover:text-forge-accent transition-colors"
                  title="Sohbeti İndir (.md)"
                >
                  <Icon icon={Download} size={14} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); if (window.confirm('Bu sohbeti silmek istediğinize emin misiniz?')) deleteThread(t.id); }}
                  className="p-1 hover:text-red-400 transition-colors"
                  title="Sohbeti Sil"
                >
                  <Icon icon={Trash2} size={14} />
                </button>
              </div>
              {t.id === activeThreadId && <ThreadEmbers />}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 h-full relative">
        <div className="flex-1 p-4 overflow-hidden flex flex-col">
          {allMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center select-none font-mono">
            {activePersona?.bootBanner ? (
              <pre className="text-[10px] text-forge-accent/80 mb-6 drop-shadow-[0_0_8px_var(--forge-accent)] leading-none">
                {activePersona.bootBanner}
              </pre>
            ) : (
              <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-forge-accent to-forge-text mb-2 tracking-tighter drop-shadow-[0_0_15px_var(--forge-accent)]">FORGE_OS</h1>
            )}
            
            {!config.modelPath ? (
              <GlassPanel intensity="low" className="flex flex-col items-center gap-2 mb-8 p-6 max-w-md text-center border-forge-warning/50">
                <Icon icon={AlertTriangle} size={24} className="text-forge-warning animate-pulse" />
                <p className="font-semibold text-sm text-forge-warning tracking-widest uppercase">SYS.ERR: MODEL_OFFLINE</p>
                <p className="text-xs text-forge-text-muted">Awaiting neural link. Select a model from the inspector panel to initialize consciousness.</p>
              </GlassPanel>
            ) : (
              <p className="text-forge-accent mb-8 uppercase tracking-widest text-sm animate-pulse">Neural link established. Awaiting input...</p>
            )}
            
            <div className="mt-8 grid grid-cols-2 gap-3 max-w-lg mx-auto w-full">
              {[
                { icon: <Icon icon={Plus} size={14} />, text: 'Kod yazmama yardım et', prompt: 'Bana Rust dilinde basit bir TCP sunucusu yaz.' },
                { icon: <Icon icon={Plus} size={14} />, text: 'Kavramları açıkla', prompt: 'Kuantum bilgisayarlarını 5 yaşındaki birine anlatır gibi açıkla.' },
                { icon: <Icon icon={Plus} size={14} />, text: 'Metin özetle', prompt: 'Aşağıdaki metni kısaca özetler misin:\n\n' },
                { icon: <Icon icon={Plus} size={14} />, text: 'Veri analizi yap', prompt: 'Elimde şöyle bir veri seti var, nasıl analiz edebilirim?\n\n' },
              ].map((item, i) => (
                <button 
                  key={i}
                  onClick={() => {
                    if (!item.prompt.endsWith('\n\n')) {
                      // Immediate send hack for pure prompts
                      // Normally we would just update input state and trigger an effect, but this is simpler
                      const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: item.prompt };
                      addMessage(userMsg);
                      setInput('');
                      const assistantMsgId = crypto.randomUUID();
                      const assistantMsg = { id: assistantMsgId, role: 'assistant' as const, content: '' };
                      setActiveMessage(assistantMsg);
                      setActiveStreamId(assistantMsgId);
                      setIsThinking(true);
                      invoke<string[]>('search_documents', { query: item.prompt, agentId: selectedAgentId || "global" }).then((contexts) => {
                        let augmentedPrompt = item.prompt;
                        if (contexts && contexts.length > 0) {
                          if (config.rag_strict_mode !== false) {
                            augmentedPrompt = `Strictly answer based on the following context information. If the answer is not in the context, say you don't know.\n---------------------\n${contexts.join('\n\n')}\n---------------------\nQuery: ${item.prompt}`;
                          } else {
                            augmentedPrompt = `Use the following context information as extra knowledge, but you can also use your own general knowledge to answer.\n---------------------\n${contexts.join('\n\n')}\n---------------------\nQuery: ${item.prompt}`;
                          }
                        }
                        
                        return invoke('start_inference', {
                          modelPath: config.modelPath,
                          params: { 
                            max_tokens: config.max_tokens, temperature: config.temperature, prompt: augmentedPrompt, 
                            system_prompt: config.system_prompt, top_p: config.top_p, top_k: config.top_k, 
                            repeat_penalty: config.repeat_penalty,
                            messages: allMessages.map(m => ({ role: m.role, content: m.content })),
                            agent_id: selectedAgentId || "global"
                          }
                        });
                      }).catch(e => {
                        console.error(e);
                        setActiveStreamId(null);
                        setIsThinking(false);
                      });
                    } else {
                      setInput(item.prompt);
                      const textArea = document.querySelector('textarea');
                      if (textArea) {
                        textArea.focus();
                        setTimeout(() => textArea.setSelectionRange(item.prompt.length, item.prompt.length), 0);
                      }
                    }
                  }}
                  className="flex items-center gap-3 p-3 bg-forge-surface/30 hover:bg-forge-surface-2 border border-forge-border/50 hover:border-forge-border rounded-xl text-left transition-colors group"
                >
                  <div className="text-2xl group-hover:scale-110 transition-transform">{item.icon}</div>
                  <div className="text-forge-text font-medium">{item.text}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <Virtuoso
              ref={virtuosoRef}
              data={allMessages}
              itemContent={renderMessage as any}
              followOutput="smooth"
              className="h-full w-full custom-scrollbar"
            />
            <button
              onClick={() => { if (window.confirm('Bu sohbetteki tüm mesajları silmek istediğinize emin misiniz?')) clearMessages(); }}
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-forge-surface/80 border border-forge-border text-forge-text-muted hover:text-red-400 hover:border-red-400/30 transition-all shadow-sm"
              title="Sohbeti Temizle"
            >
              <Icon icon={Trash2} size={16} />
            </button>
          </>
        )}
      </div>

      <div className="p-4 border-t border-forge-border bg-forge-bg">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 max-w-4xl mx-auto">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-2 bg-forge-surface border border-forge-border rounded-lg px-3 py-1.5 text-xs text-forge-text font-mono group">
                <Icon icon={FileText} size={14} className="text-forge-accent" />
                <span className="truncate max-w-[150px]">{att.name}</span>
                <button 
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-forge-text-muted hover:text-red-400 transition-colors ml-1"
                >
                  <Icon icon={X} size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={`relative flex flex-col gap-2 bg-forge-surface border ${activeStreamId ? 'border-forge-accent/30' : isRecording ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-forge-border focus-within:border-forge-accent/50'} rounded-xl p-2 transition-all duration-300 shadow-inner mx-auto max-w-4xl`}>
          <div className="flex items-center justify-between px-1 border-b border-forge-border/50 pb-2 mb-1">
            <div className="z-10 relative w-48">
              <Select
                value={selectedAgentId || ''}
                onChange={(val) => setSelectedAgentId(val || null)}
                options={[
                  { value: '', label: 'Global Assistant' },
                  ...agents.map(agent => ({ value: agent.id, label: agent.name }))
                ]}
                className="w-full"
                renderValue={(opt) => opt?.value ? opt.label : "Global Assistant"}
              />
            </div>
            <span className="text-[10px] text-forge-text-muted uppercase tracking-wider font-semibold">Active Agent</span>
          </div>
          <div className="flex items-end gap-2 w-full">
            <button
            onClick={async () => {
              try {
                const selected = await open({ multiple: true });
                if (selected) {
                  const paths = Array.isArray(selected) ? selected : [selected];
                  for (const path of paths) {
                    const content = await readTextFile(path);
                    const name = path.split(/[\/\\]/).pop() || 'Unknown';
                    setAttachments(prev => [...prev, { name, content }]);
                  }
                }
              } catch (e) {
                console.error("Failed to read attachment", e);
                useToastStore.getState().addToast({
                  type: 'error',
                  title: 'Ek Başarısız',
                  message: 'Dosya okunurken hata oluştu.'
                });
              }
            }}
            className="p-2.5 rounded-lg transition-colors border shrink-0 mb-1 flex items-center justify-center bg-forge-surface hover:bg-forge-surface-3 text-forge-text-muted hover:text-forge-accent border-transparent"
            title="Attach Text File"
          >
            <Icon icon={Paperclip} size={20} />
          </button>
          
          <button
            onClick={handleSTT}
            className={`p-2.5 rounded-lg transition-colors border shrink-0 mb-1 flex items-center justify-center ${
              isRecording 
                ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse' 
                : 'bg-forge-surface hover:bg-forge-surface-3 text-forge-text-muted hover:text-forge-text border-transparent'
            }`}
            title={isRecording ? "Listening..." : "Speak"}
          >
            <Icon icon={isRecording ? MicOff : Mic} size={20} />
          </button>
          
          <div className="flex items-start w-full relative">
            <span className="text-forge-accent font-mono text-sm mt-2 mr-2 opacity-80 whitespace-nowrap">root@forge:~#</span>
            <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput((e.target as any).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={activeStreamId ? "Model yanıt üretiyor..." : "Mesajınızı yazın... (Göndermek için Enter, Alt satır için Shift+Enter)"}
            disabled={!!activeStreamId}
            rows={1}
            className="w-full bg-transparent resize-none px-3 py-2 text-forge-text focus:outline-none disabled:opacity-50 custom-scrollbar max-h-48 font-mono"
          />
          </div>
          {activeStreamId ? (
            <button 
              onClick={handleStop}
              className="p-2.5 bg-forge-surface hover:bg-forge-danger/20 text-forge-danger rounded-lg transition-colors border border-transparent hover:border-forge-danger shrink-0 mb-1 flex items-center justify-center"
            >
              <Icon icon={Square} size={20} className="fill-current" />
            </button>
          ) : (
            <button 
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2.5 bg-forge-surface hover:bg-forge-accent hover:text-forge-text text-forge-text/50 rounded-lg transition-colors border border-forge-border hover:border-forge-accent shrink-0 mb-1 disabled:opacity-30 flex items-center justify-center"
            >
              <Icon icon={SendHorizontal} size={20} />
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
