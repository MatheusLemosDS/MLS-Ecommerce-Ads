-- Additive identity schema. Execute against ACCOUNT_DB only, never legacy ADMIN_DB.
-- Roll back code by retaining these tables and all new writes; do not drop data.
CREATE TABLE IF NOT EXISTS mls_account_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mls_account_records(kind TEXT NOT NULL,scope TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),PRIMARY KEY(kind,scope,id));
CREATE TABLE IF NOT EXISTS mls_account_emails(email TEXT PRIMARY KEY COLLATE BINARY,user_id TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS mls_account_guard(ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE IF NOT EXISTS mls_account_limits(action TEXT NOT NULL,dimension TEXT NOT NULL,key_hash TEXT NOT NULL,window_start INTEGER NOT NULL,count INTEGER NOT NULL CHECK(count>0),PRIMARY KEY(action,dimension,key_hash,window_start));
CREATE INDEX IF NOT EXISTS mls_account_records_scope ON mls_account_records(scope,kind,id);
INSERT OR IGNORE INTO mls_account_migrations(version,applied_at) VALUES(1,unixepoch());
