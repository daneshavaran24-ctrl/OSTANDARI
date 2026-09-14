import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIVE_DB, LIVE_DIR } from './fixtures';

/** پایگاه داده‌ی تازه برای هر اجرای زنده. */
export default function globalSetup(): void {
  rmSync(LIVE_DIR, { recursive: true, force: true });
  mkdirSync(LIVE_DIR, { recursive: true });

  execFileSync('node', [resolve(__dirname, '..', '..', 'db', 'migrate.mjs')], {
    env: { ...process.env, DATABASE_PATH: LIVE_DB },
    stdio: 'ignore',
  });
}
