import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SESSION_SECONDS } from './session-defaults';

/**
 * دسترسی پنل ادمین به پایگاه داده‌ی مشترک.
 *
 * همان فایلی که `agent/src/storage.py` می‌خواند. اسکیما را اینجا نمی‌سازیم —
 * آن کار `db/migrate.mjs` است. اگر فایل نباشد، پنل پیام روشن می‌دهد به‌جای
 * اینکه یک دیتابیس خالی بسازد و ادمین فکر کند چیزی کار می‌کند.
 */

export const EXPECTED_SCHEMA_VERSION = 3;

export class DatabaseUnavailableError extends Error {
  constructor() {
    super('پایگاه داده ساخته نشده است. این دستور را اجرا کنید: node db/migrate.mjs');
    this.name = 'DatabaseUnavailableError';
  }
}

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? resolve(process.cwd(), '..', 'data', 'ostandari.db');
}

let cached: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (cached) return cached;

  const path = databasePath();
  if (!existsSync(path)) throw new DatabaseUnavailableError();

  const handle = new DatabaseSync(path);
  // WAL لازم است چون ایجنت پایتون هم‌زمان می‌نویسد.
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  cached = handle;
  return handle;
}

/** فقط برای تست: اتصال کش‌شده را دور می‌ریزد. */
export function resetConnection(): void {
  cached?.close();
  cached = null;
}

export function isAvailable(): boolean {
  try {
    const row = db().prepare('SELECT version FROM schema_version').get();
    return row !== undefined;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// تنظیمات
// ---------------------------------------------------------------------------

export function getSettings(): Record<string, string> {
  const rows = db().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value);
}

export function getSessionDurationSeconds(): number {
  try {
    const row = db()
      .prepare("SELECT value FROM settings WHERE key = 'session_duration_seconds'")
      .get() as { value: string } | undefined;
    const parsed = Number.parseInt(row?.value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_SECONDS;
  } catch {
    return DEFAULT_SESSION_SECONDS;
  }
}

// ---------------------------------------------------------------------------
// کلیدهای API
// ---------------------------------------------------------------------------

export type SecretInfo = { name: string; last4: string; updatedAt: string };

/** فقط فراداده — خود کلید هرگز از سرور بیرون نمی‌رود. */
export function listSecrets(): SecretInfo[] {
  const rows = db().prepare('SELECT name, last4, updated_at FROM secrets ORDER BY name').all() as {
    name: string;
    last4: string;
    updated_at: string;
  }[];
  return rows.map((r) => ({ name: r.name, last4: r.last4, updatedAt: r.updated_at }));
}

/**
 * متن رمزشده‌ی یک کلید، برای وقتی که خود سرور باید از آن استفاده کند.
 *
 * 🔴 خروجی این تابع هرگز نباید در پاسخ HTTP قرار بگیرد. تنها مصرفش «آزمایش
 * اتصال» است: سرور کلید ذخیره‌شده را رمزگشایی می‌کند و خودش به سرویس می‌زند.
 */
export function getSecretCiphertext(name: string): string | null {
  const row = db().prepare('SELECT ciphertext FROM secrets WHERE name = ?').get(name) as
    | { ciphertext: string }
    | undefined;
  return row?.ciphertext ?? null;
}

export function saveSecret(name: string, ciphertext: string, last4: string): void {
  db()
    .prepare(
      `INSERT INTO secrets (name, ciphertext, last4, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (name) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         last4      = excluded.last4,
         updated_at = excluded.updated_at`
    )
    .run(name, ciphertext, last4);
}

export function deleteSecret(name: string): void {
  db().prepare('DELETE FROM secrets WHERE name = ?').run(name);
}

// ---------------------------------------------------------------------------
// محدودیت‌های موضوعی
// ---------------------------------------------------------------------------

export type Restriction = {
  id: number;
  topic: string;
  response: string;
  enabled: boolean;
  position: number;
};

export function listRestrictions(): Restriction[] {
  const rows = db()
    .prepare(
      'SELECT id, topic, response, enabled, position FROM restrictions ORDER BY position, id'
    )
    .all() as { id: number; topic: string; response: string; enabled: number; position: number }[];
  return rows.map((r) => ({ ...r, enabled: r.enabled === 1 }));
}

export function addRestriction(topic: string, response: string): number {
  const next = db()
    .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM restrictions')
    .get() as {
    p: number;
  };
  const row = db()
    .prepare('INSERT INTO restrictions (topic, response, position) VALUES (?, ?, ?) RETURNING id')
    .get(topic, response, next.p) as { id: number };
  return row.id;
}

export function updateRestriction(
  id: number,
  patch: { topic?: string; response?: string; enabled?: boolean }
): void {
  const current = db()
    .prepare('SELECT topic, response, enabled FROM restrictions WHERE id = ?')
    .get(id) as { topic: string; response: string; enabled: number } | undefined;
  if (!current) return;

  db()
    .prepare('UPDATE restrictions SET topic = ?, response = ?, enabled = ? WHERE id = ?')
    .run(
      patch.topic ?? current.topic,
      patch.response ?? current.response,
      patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0,
      id
    );
}

export function deleteRestriction(id: number): void {
  db().prepare('DELETE FROM restrictions WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// تاریخچه‌ی گفت‌وگو
// ---------------------------------------------------------------------------

export type ConversationSummary = {
  id: number;
  roomName: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  messageCount: number;
};

export function listConversations(limit = 50, offset = 0): ConversationSummary[] {
  const rows = db()
    .prepare(
      `SELECT c.id, c.room_name, c.started_at, c.ended_at, c.duration_seconds,
              COUNT(m.id) AS message_count
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.started_at DESC
        LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as {
    id: number;
    room_name: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    message_count: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    roomName: r.room_name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    messageCount: r.message_count,
  }));
}

export type Message = { id: number; role: string; content: string; createdAt: string };

export function getConversationMessages(conversationId: number): Message[] {
  const rows = db()
    .prepare(
      'SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id'
    )
    .all(conversationId) as {
    id: number;
    role: string;
    content: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export function deleteConversation(id: number): void {
  // messages با ON DELETE CASCADE پاک می‌شوند
  db().prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

/**
 * رونوشت‌های قدیمی‌تر از مدت نگه‌داری را پاک می‌کند.
 *
 * رونوشت شامل گفته‌های واقعی کاربر است، یعنی داده‌ی شخصی — نگه داشتن نامحدودش
 * توجیهی ندارد. جزئیات در SECURITY.md.
 */
export function purgeOldConversations(retentionDays: number): number {
  if (retentionDays <= 0) return 0;
  const result = db()
    .prepare(`DELETE FROM conversations WHERE started_at < datetime('now', ?)`)
    .run(`-${retentionDays} days`);
  return Number(result.changes);
}
