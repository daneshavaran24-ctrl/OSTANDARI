import { NextResponse } from 'next/server';
import { decryptSecret } from '@/lib/crypto';
import { getSecretCiphertext } from '@/lib/db';
import { checkGhasedakAccount } from '@/lib/sms';

export const revalidate = 0;

const REASONS: Record<string, string> = {
  network: 'اتصال به قاصدک برقرار نشد. دسترسی شبکه‌ی سرور را بررسی کنید.',
  auth: 'قاصدک این کلید را نپذیرفت. کلید را دوباره وارد کنید.',
  service: 'قاصدک پاسخ نامنتظره داد. کمی بعد دوباره تلاش کنید.',
  malformed: 'کلید نویسه‌ی غیرمجاز دارد (نویسه‌ی فارسی یا فاصله‌ی نامرئی). دوباره کپی‌اش کنید.',
};

/**
 * «آزمایش اتصال» — اعتبار حساب را می‌خواند، پیامکی نمی‌فرستد.
 *
 * کلید یا از بدنه می‌آید (کلیدی که مدیر همین حالا تایپ کرده و هنوز ذخیره
 * نشده) یا از کلید ذخیره‌شده خوانده می‌شود. در هیچ حالتی کلید در پاسخ
 * برنمی‌گردد.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { apiKey?: unknown };
  let apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

  if (!apiKey) {
    const stored = getSecretCiphertext('sms_api_key');
    if (!stored) {
      return NextResponse.json(
        { ok: false, error: 'هنوز کلیدی برای قاصدک ذخیره نشده است.' },
        { status: 400 }
      );
    }
    try {
      apiKey = decryptSecret(stored);
    } catch (error) {
      console.error('رمزگشایی کلید قاصدک ناموفق بود:', error);
      return NextResponse.json(
        { ok: false, error: 'رمزگشایی کلید ناموفق بود. ENCRYPTION_KEY را بررسی کنید.' },
        { status: 500 }
      );
    }
  }

  const result = await checkGhasedakAccount(apiKey);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: REASONS[result.reason] });
  }

  return NextResponse.json({ ok: true, credit: result.credit });
}
