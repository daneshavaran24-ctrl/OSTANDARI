import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * رمزنگاری کلیدهای API پیش از ذخیره در پایگاه داده.
 *
 * ⚠️ قالب این فایل باید **دقیقاً** با `agent/src/crypto.py` یکی بماند، چون
 * پنل ادمین رمز می‌کند و ایجنت پایتون رمزگشایی می‌کند. اگر یکی را عوض کردید،
 * دیگری را هم عوض کنید و تست رفت‌وبرگشت دوزبانه را اجرا کنید — وگرنه کلیدها
 * بی‌صدا غیرقابل‌خواندن می‌شوند و فقط موقع اجرای واقعی معلوم می‌شود.
 *
 * قالب: base64( iv[12] ‖ tag[16] ‖ ciphertext )  با AES-256-GCM
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class EncryptionKeyError extends Error {}

/** کلید ۳۲ بایتی را از ENCRYPTION_KEY (base64) می‌خواند. */
export function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new EncryptionKeyError(
      'ENCRYPTION_KEY تنظیم نشده است. با این دستور یکی بسازید: ' +
        'openssl rand -base64 32'
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new EncryptionKeyError(
      `ENCRYPTION_KEY باید ${KEY_LENGTH} بایت باشد (base64)، ولی ${key.length} بایت است.`
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('مقدار خالی قابل رمزنگاری نیست.');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const blob = Buffer.from(encoded, 'base64');
  if (blob.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error('داده‌ی رمزشده ناقص است.');
  }

  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = blob.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * چهار کاراکتر آخر کلید، برای نمایش در پنل.
 *
 * کلید کامل هرگز به مرورگر برنمی‌گردد؛ ادمین فقط باید بتواند تشخیص بدهد کدام
 * کلید را وارد کرده است.
 */
export function lastFour(secret: string): string {
  return secret.length <= 4 ? '••••' : secret.slice(-4);
}
