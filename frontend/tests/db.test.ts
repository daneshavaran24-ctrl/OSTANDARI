import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as store from '@/lib/db';

/**
 * تست‌های لایه‌ی داده‌ی پنل ادمین، روی یک پایگاه داده‌ی واقعی.
 *
 * عمداً از همان `db/migrate.mjs` استفاده می‌شود که روی سرور اجرا می‌شود، نه یک
 * اسکیمای دست‌ساز در تست. اگر اسکیما و کد از هم دور بیفتند، همین‌جا معلوم
 * می‌شود؛ با یک اسکیمای تکراری در تست، هرگز.
 */

const MIGRATE = resolve(__dirname, '..', '..', 'db', 'migrate.mjs');

let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ostandari-db-'));
  path = join(directory, 'test.db');
  execFileSync('node', [MIGRATE], {
    env: { ...process.env, DATABASE_PATH: path },
    stdio: 'ignore',
  });
  process.env.DATABASE_PATH = path;
  store.resetConnection();
});

afterEach(() => {
  store.resetConnection();
  delete process.env.DATABASE_PATH;
  rmSync(directory, { recursive: true, force: true });
});

function raw<T = unknown>(sql: string, ...params: unknown[]): T {
  const handle = new DatabaseSync(path);
  try {
    return handle.prepare(sql).get(...(params as never[])) as T;
  } finally {
    handle.close();
  }
}

describe('دسترسی به پایگاه داده', () => {
  it('نبود فایل، خطای روشن می‌دهد نه پایگاه داده‌ی خالی', () => {
    // ساختن خودکار یک فایل خالی بدترین حالت است: پنل کار می‌کند، ولی ایجنت
    // به فایل دیگری نگاه می‌کند و هیچ‌کس نمی‌فهمد چرا تنظیمات اثر ندارد.
    process.env.DATABASE_PATH = join(directory, 'nope.db');
    store.resetConnection();

    expect(() => store.getSettings()).toThrow(store.DatabaseUnavailableError);
    expect(store.isAvailable()).toBe(false);
  });

  it('با اسکیمای درست در دسترس است', () => {
    expect(store.isAvailable()).toBe(true);
    expect(raw<{ version: number }>('SELECT version FROM schema_version').version).toBe(
      store.EXPECTED_SCHEMA_VERSION
    );
  });

  it('مسیر پیش‌فرض کنار ریشه‌ی مخزن است', () => {
    delete process.env.DATABASE_PATH;
    expect(store.databasePath()).toMatch(/data[/\\]ostandari\.db$/);
  });
});

describe('تنظیمات', () => {
  it('مقدار نوشته‌شده خوانده می‌شود', () => {
    store.setSetting('openai_voice', 'marin');
    expect(store.getSettings().openai_voice).toBe('marin');
  });

  it('نوشتن دوباره جایگزین می‌شود، نه ردیف تازه', () => {
    store.setSetting('openai_voice', 'cedar');
    store.setSetting('openai_voice', 'marin');

    expect(store.getSettings().openai_voice).toBe('marin');
    expect(
      raw<{ n: number }>("SELECT COUNT(*) AS n FROM settings WHERE key = 'openai_voice'").n
    ).toBe(1);
  });

  it('مدت نشست پیش‌فرض ۳۰۰ ثانیه است', () => {
    expect(store.getSessionDurationSeconds()).toBe(300);
  });

  it('مقدار نامعتبر یا منفی به پیش‌فرض برمی‌گردد', () => {
    // بدون این، یک تایپو در پنل می‌توانست نشست را صفر یا منفی ثانیه کند
    for (const bad of ['هرچه', '', '0', '-10']) {
      store.setSetting('session_duration_seconds', bad);
      expect(store.getSessionDurationSeconds()).toBe(300);
    }
  });
});

describe('کلیدهای API', () => {
  it('فقط فراداده برمی‌گردد، نه خود کلید', () => {
    store.saveSecret('openai_api_key', 'رمزشده-۱۲۳', '4321');

    const [secret] = store.listSecrets();
    expect(secret.name).toBe('openai_api_key');
    expect(secret.last4).toBe('4321');
    // مهم‌ترین ادعای این فایل: متن رمزشده هرگز از این تابع بیرون نمی‌آید
    expect(JSON.stringify(store.listSecrets())).not.toContain('رمزشده');
  });

  it('ذخیره‌ی دوباره جایگزین می‌شود', () => {
    store.saveSecret('openai_api_key', 'اول', '1111');
    store.saveSecret('openai_api_key', 'دوم', '2222');

    expect(store.listSecrets()).toHaveLength(1);
    expect(store.listSecrets()[0].last4).toBe('2222');
    expect(
      raw<{ ciphertext: string }>("SELECT ciphertext FROM secrets WHERE name = 'openai_api_key'")
        .ciphertext
    ).toBe('دوم');
  });

  it('حذف کلید ردیف را برمی‌دارد', () => {
    store.saveSecret('bey_api_key', 'رمزشده', '9999');
    store.deleteSecret('bey_api_key');
    expect(store.listSecrets()).toHaveLength(0);
  });
});

describe('محدودیت‌های موضوعی', () => {
  it('مهاجرت دو نمونه‌ی اولیه می‌سازد', () => {
    expect(store.listRestrictions()).toHaveLength(2);
  });

  it('افزودن به انتهای فهرست می‌نشیند', () => {
    const id = store.addRestriction('موضوع تازه', 'پاسخ تازه');
    const items = store.listRestrictions();

    expect(items).toHaveLength(3);
    expect(items[2].id).toBe(id);
    expect(items[2].position).toBeGreaterThan(items[1].position);
    // ایجنت محدودیت‌ها را به همین ترتیب به پرامپت می‌دهد
    expect(items[2].enabled).toBe(true);
  });

  it('غیرفعال کردن فقط همان ردیف را عوض می‌کند', () => {
    const id = store.addRestriction('موضوع تازه', 'پاسخ تازه');
    store.updateRestriction(id, { enabled: false });

    const items = store.listRestrictions();
    expect(items.find((r) => r.id === id)?.enabled).toBe(false);
    expect(items.filter((r) => r.enabled)).toHaveLength(2);
  });

  it('ویرایش جزئی، فیلدهای دیگر را پاک نمی‌کند', () => {
    const id = store.addRestriction('موضوع', 'پاسخ اصلی');
    store.updateRestriction(id, { topic: 'موضوع ویرایش‌شده' });

    const item = store.listRestrictions().find((r) => r.id === id);
    expect(item?.topic).toBe('موضوع ویرایش‌شده');
    expect(item?.response).toBe('پاسخ اصلی');
    expect(item?.enabled).toBe(true);
  });

  it('ویرایش شناسه‌ی ناموجود بی‌اثر است', () => {
    store.updateRestriction(9999, { enabled: false });
    expect(store.listRestrictions().filter((r) => r.enabled)).toHaveLength(2);
  });

  it('حذف فقط همان ردیف را برمی‌دارد', () => {
    const id = store.addRestriction('موضوع تازه', 'پاسخ تازه');
    store.deleteRestriction(id);
    expect(store.listRestrictions()).toHaveLength(2);
  });
});

describe('تاریخچه‌ی گفت‌وگو', () => {
  function seed(room: string, ageDays = 0, messages = 0): number {
    const handle = new DatabaseSync(path);
    try {
      const row = handle
        .prepare(
          "INSERT INTO conversations (room_name, started_at) VALUES (?, datetime('now', ?)) RETURNING id"
        )
        .get(room, `-${ageDays} days`) as { id: number };
      const insert = handle.prepare(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
      );
      for (let i = 0; i < messages; i++) insert.run(row.id, 'user', `پیام ${i}`);
      return row.id;
    } finally {
      handle.close();
    }
  }

  it('تعداد پیام هر گفت‌وگو شمرده می‌شود', () => {
    seed('اتاق-الف', 0, 3);
    const [conversation] = store.listConversations();
    expect(conversation.roomName).toBe('اتاق-الف');
    expect(conversation.messageCount).toBe(3);
  });

  it('گفت‌وگوی بدون پیام هم در فهرست می‌آید', () => {
    // با INNER JOIN، نشستی که کاربر بی‌صدا رفته کلاً ناپدید می‌شد
    seed('اتاق-خالی', 0, 0);
    expect(store.listConversations()).toHaveLength(1);
    expect(store.listConversations()[0].messageCount).toBe(0);
  });

  it('تازه‌ترین گفت‌وگو اول می‌آید', () => {
    seed('اتاق-قدیمی', 5);
    seed('اتاق-تازه', 0);
    expect(store.listConversations().map((c) => c.roomName)).toEqual(['اتاق-تازه', 'اتاق-قدیمی']);
  });

  it('limit و offset صفحه‌بندی می‌کنند', () => {
    seed('اتاق-۱', 3);
    seed('اتاق-۲', 2);
    seed('اتاق-۳', 1);

    expect(store.listConversations(2, 0).map((c) => c.roomName)).toEqual(['اتاق-۳', 'اتاق-۲']);
    expect(store.listConversations(2, 2).map((c) => c.roomName)).toEqual(['اتاق-۱']);
  });

  it('پیام‌ها به ترتیب ثبت برمی‌گردند', () => {
    const id = seed('اتاق', 0, 3);
    expect(store.getConversationMessages(id).map((m) => m.content)).toEqual([
      'پیام 0',
      'پیام 1',
      'پیام 2',
    ]);
  });

  it('حذف گفت‌وگو پیام‌هایش را هم می‌برد', () => {
    const id = seed('اتاق', 0, 2);
    store.deleteConversation(id);

    expect(store.listConversations()).toHaveLength(0);
    // اگر کلید خارجی روشن نباشد، متن گفته‌های کاربر بی‌صدا باقی می‌ماند
    expect(raw<{ n: number }>('SELECT COUNT(*) AS n FROM messages').n).toBe(0);
  });
});

describe('پاک‌سازی رونوشت‌های قدیمی', () => {
  function seed(room: string, ageDays: number): void {
    const handle = new DatabaseSync(path);
    try {
      const row = handle
        .prepare(
          "INSERT INTO conversations (room_name, started_at) VALUES (?, datetime('now', ?)) RETURNING id"
        )
        .get(room, `-${ageDays} days`) as { id: number };
      handle
        .prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', 'سلام')")
        .run(row.id);
    } finally {
      handle.close();
    }
  }

  it('فقط موارد قدیمی‌تر از مدت نگه‌داری پاک می‌شوند', () => {
    seed('اتاق-تازه', 1);
    seed('اتاق-کهنه', 40);

    expect(store.purgeOldConversations(30)).toBe(1);
    expect(store.listConversations().map((c) => c.roomName)).toEqual(['اتاق-تازه']);
  });

  it('پیام‌ها هم با همان پاک می‌شوند', () => {
    seed('اتاق-کهنه', 40);
    store.purgeOldConversations(30);
    expect(raw<{ n: number }>('SELECT COUNT(*) AS n FROM messages').n).toBe(0);
  });

  it('مدت صفر یا منفی یعنی پاک‌سازی خاموش', () => {
    seed('اتاق-خیلی-کهنه', 4000);
    for (const days of [0, -1]) {
      expect(store.purgeOldConversations(days)).toBe(0);
    }
    expect(store.listConversations()).toHaveLength(1);
  });
});
