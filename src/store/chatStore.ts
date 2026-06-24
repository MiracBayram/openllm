import { create } from 'zustand';
import { getDb } from './sqlite';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  contexts?: string[];
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

interface ChatState {
  threads: ChatThread[];
  activeThreadId: string | null;
  activeMessage: Message | null;
  totalMessages: number;
  ageFactor: number;
  
  loadFromDb: () => Promise<void>;
  
  createThread: () => string;
  setActiveThread: (id: string) => void;
  deleteThread: (id: string) => void;
  
  addMessage: (msg: Message) => void;
  setActiveMessage: (msg: Message) => void;
  appendContentToActiveMessage: (content: string) => void;
  commitActiveMessage: () => void;
  
  deleteMessage: (threadId: string, messageId: string) => void;
  updateMessage: (threadId: string, messageId: string, content: string) => void;
  clearMessages: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

const generateSmartTitle = (content: string) => {
  const cleanContent = content.trim().replace(/[\r\n]+/g, ' ');
  const words = cleanContent.split(' ').filter(w => w.length > 0);
  if (words.length <= 5) return cleanContent;
  return words.slice(0, 5).join(' ') + '...';
};

export const useChatStore = create<ChatState>()(
    (set, get) => ({
      threads: [],
      activeThreadId: null,
      activeMessage: null,
      totalMessages: 0,
      ageFactor: 0,

      loadFromDb: async () => {
        try {
          const db = await getDb();
          
          const countData: any[] = await db.select('SELECT COUNT(*) as count FROM messages');
          const totalMessages = countData.length > 0 ? countData[0].count : 0;
          const ageFactor = Math.min(totalMessages / 1000, 1);
          document.documentElement.style.setProperty('--age-factor', String(ageFactor));

          const threadsData: any[] = await db.select('SELECT * FROM threads ORDER BY updated_at DESC');
          
          let firstThreadId = threadsData.length > 0 ? threadsData[0].id : null;
          let messagesData: any[] = [];
          if (firstThreadId) {
            messagesData = await db.select('SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC', [firstThreadId]);
          }
          
          const loadedThreads: ChatThread[] = threadsData.map(t => ({
            id: t.id,
            title: t.title,
            updatedAt: t.updated_at,
            messages: t.id === firstThreadId ? messagesData.map(m => ({
              id: m.id,
              role: m.role,
              content: m.content
            })) : []
          }));
          
          set({ threads: loadedThreads, activeThreadId: firstThreadId, totalMessages, ageFactor });
        } catch (e) {
          console.error("Failed to load chat history", e);
        }
      },

      createThread: () => {
        const id = generateId();
        const now = Date.now();
        const newThread: ChatThread = {
          id,
          title: 'New Chat',
          updatedAt: now,
          messages: []
        };
        
        getDb().then(db => {
          db.execute('INSERT INTO threads (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)', [id, 'New Chat', now, now]);
        }).catch(console.error);

        set((state) => ({
          threads: [newThread, ...state.threads],
          activeThreadId: id
        }));
        return id;
      },

      setActiveThread: (id) => {
        set({ activeThreadId: id, activeMessage: null });
        getDb().then(async db => {
            const messagesData: any[] = await db.select('SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC', [id]);
            if (messagesData.length > 0) {
                set(state => ({
                    threads: state.threads.map(t => t.id === id && t.messages.length === 0 ? {
                        ...t,
                        messages: messagesData.map(m => ({
                            id: m.id,
                            role: m.role,
                            content: m.content
                        }))
                    } : t)
                }));
            }
        }).catch(console.error);
      },
      
      deleteThread: (id) => {
        getDb().then(db => {
          db.execute('DELETE FROM threads WHERE id = $1', [id]);
        }).catch(console.error);

        set((state) => {
          const remaining = state.threads.filter(t => t.id !== id);
          return {
            threads: remaining,
            activeThreadId: state.activeThreadId === id ? (remaining[0]?.id || null) : state.activeThreadId
          };
        });
      },

      addMessage: (msg) => {
        let currentThreadId = get().activeThreadId;
        const now = Date.now();
        
        if (!currentThreadId) {
          currentThreadId = generateId();
          const title = generateSmartTitle(msg.content);
          const newThread: ChatThread = {
            id: currentThreadId,
            title,
            updatedAt: now,
            messages: []
          };
          
          getDb().then(db => {
            db.execute('INSERT INTO threads (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)', [currentThreadId, title, now, now]);
          }).catch(console.error);
          
          set(state => ({
            threads: [newThread, ...state.threads],
            activeThreadId: currentThreadId
          }));
        }

        getDb().then(async db => {
          try {
            await db.execute('BEGIN TRANSACTION');
            await db.execute('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)', [msg.id, currentThreadId, msg.role, msg.content, now]);
            await db.execute('UPDATE threads SET updated_at = $1 WHERE id = $2', [now, currentThreadId]);
            await db.execute('COMMIT');
          } catch (e) {
            await db.execute('ROLLBACK').catch(() => {});
            console.error(e);
          }
        }).catch(console.error);

        set((state) => {
          let newThreads = [...state.threads];
          const threadIndex = newThreads.findIndex(t => t.id === currentThreadId);
          if (threadIndex !== -1) {
            const thread = { ...newThreads[threadIndex] };
            if (thread.messages.length === 0 && msg.role === 'user') {
              thread.title = generateSmartTitle(msg.content);
              getDb().then(db => db.execute('UPDATE threads SET title = $1 WHERE id = $2', [thread.title, currentThreadId]));
            }
            thread.messages = [...thread.messages, msg].slice(-500);
            thread.updatedAt = now;
            
            // Move to top
            newThreads.splice(threadIndex, 1);
            newThreads.unshift(thread);
          }
          const newTotal = state.totalMessages + 1;
          const ageFactor = Math.min(newTotal / 1000, 1);
          document.documentElement.style.setProperty('--age-factor', String(ageFactor));
          return { threads: newThreads, activeThreadId: currentThreadId, totalMessages: newTotal, ageFactor };
        });
      },

      setActiveMessage: (msg) => set({ activeMessage: msg }),
      
      appendContentToActiveMessage: (content) => set((state) => {
        if (!state.activeMessage) return state;
        return { activeMessage: { ...state.activeMessage, content: state.activeMessage.content + content } };
      }),

      commitActiveMessage: () => {
        const state = get();
        if (!state.activeMessage || !state.activeThreadId) return;
        
        const now = Date.now();
        const msg = state.activeMessage;
        const threadId = state.activeThreadId;

        getDb().then(async db => {
          try {
            await db.execute('BEGIN TRANSACTION');
            await db.execute('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)', [msg.id, threadId, msg.role, msg.content, now]);
            await db.execute('UPDATE threads SET updated_at = $1 WHERE id = $2', [now, threadId]);
            await db.execute('COMMIT');
          } catch (e) {
            await db.execute('ROLLBACK').catch(() => {});
            console.error(e);
          }
        }).catch(console.error);

        set((state) => {
          const newThreads = [...state.threads];
          const threadIndex = newThreads.findIndex(t => t.id === threadId);
          
          if (threadIndex !== -1) {
            const thread = { ...newThreads[threadIndex] };
            thread.messages = [...thread.messages, msg].slice(-500);
            thread.updatedAt = now;
            newThreads[threadIndex] = thread;
          }
          const newTotal = state.totalMessages + 1;
          const ageFactor = Math.min(newTotal / 1000, 1);
          document.documentElement.style.setProperty('--age-factor', String(ageFactor));

          return { 
            threads: newThreads,
            activeMessage: null,
            totalMessages: newTotal,
            ageFactor
          };
        });
      },

      deleteMessage: (threadId, messageId) => {
        getDb().then(db => {
          db.execute('DELETE FROM messages WHERE id = $1', [messageId]);
        }).catch(console.error);

        set((state) => {
          const newThreads = state.threads.map(t => {
            if (t.id === threadId) {
              return { ...t, messages: t.messages.filter(m => m.id !== messageId) };
            }
            return t;
          });
          return { threads: newThreads };
        });
      },

      updateMessage: (threadId, messageId, content) => {
        getDb().then(db => {
          db.execute('UPDATE messages SET content = $1 WHERE id = $2', [content, messageId]);
        }).catch(console.error);

        set((state) => {
          const newThreads = state.threads.map(t => {
            if (t.id === threadId) {
              return {
                ...t,
                messages: t.messages.map(m => m.id === messageId ? { ...m, content } : m)
              };
            }
            return t;
          });
          return { threads: newThreads };
        });
      },

      clearMessages: () => {
        const activeThreadId = get().activeThreadId;
        if (!activeThreadId) return;

        getDb().then(db => {
          db.execute('DELETE FROM messages WHERE thread_id = $1', [activeThreadId]);
        }).catch(console.error);

        set((state) => {
          const newThreads = state.threads.map(t => 
            t.id === activeThreadId ? { ...t, messages: [] } : t
          );
          return { threads: newThreads, activeMessage: null };
        });
      },
    })
);
