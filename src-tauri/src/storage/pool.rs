use std::path::Path;
use std::time::Duration;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

pub struct StorageCore {
    pub writer: tokio::sync::Mutex<r2d2::PooledConnection<SqliteConnectionManager>>,
    pub readers: Pool<SqliteConnectionManager>,
}

impl StorageCore {
    pub fn open<P: AsRef<Path>>(db_path: P) -> anyhow::Result<Self> {
        let mgr = SqliteConnectionManager::file(db_path.as_ref())
            .with_init(|c| {
                c.execute_batch(
                    "PRAGMA journal_mode=WAL;\n\
                     PRAGMA synchronous=NORMAL;\n\
                     PRAGMA temp_store=MEMORY;\n\
                     PRAGMA mmap_size=4294967296;\n\
                     PRAGMA cache_size=-262144;\n\
                     PRAGMA page_size=32768;\n\
                     PRAGMA wal_autocheckpoint=1000;\n\
                     PRAGMA wal_checkpoint=PASSIVE;\n\
                     PRAGMA foreign_keys=ON;\n\
                     PRAGMA busy_timeout=5000;\n\
                     PRAGMA optimize;",
                )?;
                Ok(())
            });

        let readers = Pool::builder()
            .min_idle(Some(4))
            .max_size(16)
            .connection_timeout(Duration::from_secs(5))
            .idle_timeout(Some(Duration::from_secs(300)))
            .max_lifetime(Some(Duration::from_secs(1800)))
            .connection_customizer(Box::new(PragmaCustomizer))
            .build(mgr)?;

        let writer_pool = Pool::builder()
            .max_size(1)
            .connection_customizer(Box::new(PragmaCustomizer))
            .build(
                SqliteConnectionManager::file(db_path.as_ref())
                    .with_init(|c| {
                        c.execute_batch(
                            "PRAGMA journal_mode=WAL;\n\
                             PRAGMA synchronous=NORMAL;\n\
                             PRAGMA mmap_size=4294967296;\n\
                             PRAGMA cache_size=-524288;\n\
                             PRAGMA wal_autocheckpoint=2000;",
                        )?;
                        Ok(())
                    }),
            )?;

        let writer = writer_pool.get()?;
        Ok(Self {
            writer: tokio::sync::Mutex::new(writer),
            readers,
        })
    }

    pub fn get(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>, r2d2::Error> {
        self.readers.get()
    }
}

#[derive(Debug)]
struct PragmaCustomizer;
impl r2d2::CustomizeConnection<rusqlite::Connection, rusqlite::Error>
    for PragmaCustomizer
{
    fn on_acquire(
        &self,
        conn: &mut rusqlite::Connection,
    ) -> Result<(), rusqlite::Error> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;\n\
             PRAGMA synchronous=NORMAL;\n\
             PRAGMA temp_store=MEMORY;\n\
             PRAGMA mmap_size=4294967296;\n\
             PRAGMA cache_size=-262144;\n\
             PRAGMA busy_timeout=5000;",
        )?;
        Ok(())
    }
}
