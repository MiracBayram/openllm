import Database from '@tauri-apps/plugin-sql';

let dbPromise: Promise<Database> | null = null;

async function initDb(): Promise<Database> {
  const db = await Database.load('sqlite:forge.db');
  await db.execute('PRAGMA foreign_keys = ON;');
  await db.execute('PRAGMA busy_timeout = 5000;');
  await db.execute('PRAGMA journal_mode = WAL;');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      metadata TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      role TEXT,
      content TEXT,
      created_at INTEGER,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY,
      filename TEXT,
      agent_id TEXT,
      uploaded_at INTEGER
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      content TEXT,
      embedding_blob BLOB,
      FOREIGN KEY(document_id) REFERENCES rag_documents(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      system_prompt TEXT,
      status TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_document_id ON rag_chunks(document_id);`);
  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
      content,
      chunk_id UNINDEXED
    )
  `);
  return db;
}

export const getDb = (): Promise<Database> => {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
};
