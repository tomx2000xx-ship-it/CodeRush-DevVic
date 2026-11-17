-- Telegram broadcast queue: resumable, rate-limited, auditable admin sends.
CREATE TABLE IF NOT EXISTS telegram_broadcast_jobs (
 id TEXT PRIMARY KEY,
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 4096),
 audience TEXT NOT NULL DEFAULT 'all_active' CHECK(audience IN ('all_active')),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','completed','failed')),
 total_count INTEGER NOT NULL DEFAULT 0,
 sent_count INTEGER NOT NULL DEFAULT 0,
 failed_count INTEGER NOT NULL DEFAULT 0,
 blocked_count INTEGER NOT NULL DEFAULT 0,
 last_chat_id TEXT,
 started_at TEXT,
 completed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_broadcast_jobs_queue ON telegram_broadcast_jobs(status,created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_broadcast_jobs_creator ON telegram_broadcast_jobs(created_by,created_at DESC);
