#!/usr/bin/env node
/**
 * ساخت یا به‌روزرسانی اسکیمای پایگاه داده‌ی مشترک.
 *
 *   node db/migrate.mjs
 *
 * بی‌خطر است که چند بار اجرا شود. مسیر فایل از DATABASE_PATH می‌آید، وگرنه
 * data/ostandari.db کنار ریشه‌ی مخزن.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 3;

// node:sqlite از Node 22.5 اضافه شده است. بدون این بررسی، نسخه‌های قدیمی‌تر
// خطای مبهم ERR_UNKNOWN_BUILTIN_MODULE می‌دهند که ربطش به نسخه‌ی Node معلوم
// نیست. روی سیستم‌هایی که چند نسخه نصب است، این پیام مستقیماً راه‌حل را
// می‌گوید.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(
    `این اسکریپت به Node 22.5 یا بالاتر نیاز دارد (node:sqlite)، ولی نسخه‌ی ` +
      `فعلی ${process.versions.node} است.\n` +
      `اگر چند نسخه نصب دارید، مسیر کامل نسخه‌ی درست را صدا بزنید.`
  );
  process.exit(1);
}

const { DatabaseSync } = await import('node:sqlite');

const dbPath = process.env.DATABASE_PATH ?? resolve(HERE, '..', 'data', 'ostandari.db');
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(HERE, 'schema.sql'), 'utf8'));

const current = db.prepare('SELECT version FROM schema_version').get();
if (!current) {
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
} else if (current.version < SCHEMA_VERSION) {
  db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
} else if (current.version > SCHEMA_VERSION) {
  console.error(
    `نسخه‌ی اسکیمای موجود (${current.version}) جلوتر از این اسکریپت ` +
      `(${SCHEMA_VERSION}) است. اسکریپت مهاجرت را به‌روز کنید.`
  );
  process.exit(1);
}

// محدودیت‌های نمونه، فقط بار اول. اگر ادمین همه را پاک کرد، دوباره برنمی‌گردند.
const seeded = db.prepare('SELECT COUNT(*) AS n FROM settings').get();
if (seeded.n === 0) {
  const setting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  setting.run('session_duration_seconds', '300');
  setting.run('record_transcripts', '1');
  setting.run('transcript_retention_days', '30');

  const restriction = db.prepare(
    'INSERT INTO restrictions (topic, response, position) VALUES (?, ?, ?)'
  );
  restriction.run('مسائل سیاسی', 'در این باره نمی‌توانم صحبت کنم.', 1);
  restriction.run('مسائل دینی و مذهبی', 'پاسخ به پرسش‌های دینی در حوزه‌ی کاری من نیست.', 2);

  console.log('✓ تنظیمات و محدودیت‌های اولیه ساخته شد');
}

db.close();
console.log(`✓ پایگاه داده آماده است: ${dbPath}`);
