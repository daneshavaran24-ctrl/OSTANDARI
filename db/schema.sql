-- اسکیمای پایگاه داده‌ی مشترک.
--
-- این فایل را هم Next.js (پنل ادمین، نویسنده) و هم ایجنت پایتون (خواننده و
-- نویسنده‌ی رونوشت) باز می‌کنند. حالت WAL روشن است چون دو فرایند مستقل هم‌زمان
-- به آن دسترسی دارند؛ بدون WAL، یک نویسنده همه‌ی خواننده‌ها را قفل می‌کند.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- نسخه‌ی اسکیما. هر دو سمت پیش از استفاده بررسی می‌کنند تا اگر یکی جلوتر بود،
-- به‌جای خرابی خاموش، خطای روشن بدهد.
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

-- تنظیمات به‌صورت کلید/مقدار. مقدار همیشه متن است و خواننده تبدیلش می‌کند.
-- نبودن یک کلید یعنی «از متغیر محیطی یا پیش‌فرض استفاده کن».
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- کلیدهای API، رمزشده با AES-256-GCM.
-- ciphertext قالب base64(iv ‖ tag ‖ data) دارد و کلید رمزگشایی فقط در
-- متغیر محیطی ENCRYPTION_KEY است، پس دزدیدن این فایل به‌تنهایی کافی نیست.
-- last4 برای نمایش در پنل است؛ خود کلید هرگز به مرورگر برنمی‌گردد.
CREATE TABLE IF NOT EXISTS secrets (
  name       TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  last4      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- موضوع‌هایی که دستیار نباید درباره‌شان صحبت کند.
-- به دستورهای مدل تزریق می‌شوند؛ راهنمایی است نه تضمین قطعی.
CREATE TABLE IF NOT EXISTS restrictions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic      TEXT NOT NULL,
  response   TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_restrictions_enabled
  ON restrictions (enabled, position);

-- یک گفت‌وگو = یک اتاق LiveKit.
CREATE TABLE IF NOT EXISTS conversations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  room_name        TEXT NOT NULL UNIQUE,
  started_at       TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at         TEXT,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_conversations_started
  ON conversations (started_at DESC);

-- پیام‌های هر گفت‌وگو. حاوی گفته‌های واقعی کاربر است، یعنی داده‌ی شخصی —
-- سیاست نگه‌داری در SECURITY.md آمده و پاک‌سازی خودکار دارد.
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, id);
