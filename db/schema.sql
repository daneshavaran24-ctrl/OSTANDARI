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

-- ---------------------------------------------------------------------------
-- نسخه‌ی ۲ — رخدادهای RPC
-- ---------------------------------------------------------------------------

-- هر فراخوانی RPC از ایجنت به مرورگر. برای عیب‌یابی و برای دیدن اینکه کدام
-- Action روی دستگاه کاربر واقعاً اجرا شده است.
--
-- conversation_id می‌تواند NULL باشد: اگر ثبت رونوشت خاموش باشد ردیف گفت‌وگو
-- ساخته نمی‌شود، ولی رخداد RPC همچنان ارزش عیب‌یابی دارد.
CREATE TABLE IF NOT EXISTS rpc_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations (id) ON DELETE CASCADE,
  action_id       TEXT NOT NULL,
  method          TEXT NOT NULL,
  direction       TEXT NOT NULL DEFAULT 'agent_to_client',
  status          TEXT NOT NULL,
  duration_ms     INTEGER,
  error           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rpc_events_conversation
  ON rpc_events (conversation_id, id);

CREATE INDEX IF NOT EXISTS idx_rpc_events_created
  ON rpc_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- نسخه‌ی ۳ — رخدادهای پیامک
-- ---------------------------------------------------------------------------

-- هر تلاش ارسال پیامک، موفق یا ناموفق.
--
-- client_reference_id شناسه‌ی یکتایی است که به قاصدک هم فرستاده می‌شود. یکتا
-- بودنش در همین جدول تضمین می‌کند که یک retry دو پیامک نفرستد: پیش از ارسال،
-- ردیف با همین شناسه درج می‌شود و اگر از قبل باشد، ارسال دوباره انجام نمی‌شود.
CREATE TABLE IF NOT EXISTS sms_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id     INTEGER REFERENCES conversations (id) ON DELETE CASCADE,
  client_reference_id TEXT NOT NULL UNIQUE,
  recipient           TEXT NOT NULL,
  provider            TEXT NOT NULL DEFAULT 'ghasedak',
  status              TEXT NOT NULL,
  message_id          TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sms_events_created
  ON sms_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_events_conversation
  ON sms_events (conversation_id, id);
