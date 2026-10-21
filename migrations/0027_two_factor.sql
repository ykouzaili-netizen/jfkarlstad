-- Migrering 27: tvåstegsverifiering för adminpanelen (kod från en autentiseringsapp, RFC 6238) och reservkoder.
-- Hemligheten sparas krypterad (AES-GCM med en nyckel som härleds från appens hemlighet), reservkoderna som SHA-256.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_pending TEXT;
ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;
ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN recovery_codes TEXT NOT NULL DEFAULT '';
