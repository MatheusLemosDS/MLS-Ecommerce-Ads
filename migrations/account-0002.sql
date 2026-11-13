-- Additive metadata only. ACCOUNT_DB; preserves all existing account/domain rows.
-- This is the same registry used by the explicit legacy tenant migration.
-- Empty registry means no legacy alias; an incomplete receipt fails closed.
CREATE TABLE IF NOT EXISTS mls_tenant_migrations(organization_id TEXT NOT NULL,store_id TEXT NOT NULL,domain TEXT NOT NULL,migration_version INTEGER NOT NULL DEFAULT 1,source_digest TEXT NOT NULL,owner_user_id TEXT NOT NULL,state TEXT NOT NULL,legacy_cash_tenant TEXT,completed_at INTEGER,PRIMARY KEY(organization_id,store_id,domain));
INSERT OR IGNORE INTO mls_account_migrations(version,applied_at) VALUES(2,unixepoch());
