import { NextResponse } from 'next/server';
import { encryptSecret, lastFour } from '@/lib/crypto';
import { deleteSecret, listSecrets, saveSecret } from '@/lib/db';

export const revalidate = 0;

/** کلیدهایی که پنل می‌تواند ذخیره کند. */
const ALLOWED = new Set(['openai_api_key', 'bey_api_key', 'sms_api_key']);

/** فقط فراداده — خود کلید هرگز به مرورگر برنمی‌گردد. */
export async function GET() {
  return NextResponse.json({ secrets: listSecrets() });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { name?: unknown; value?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const value = typeof body.value === 'string' ? body.value.trim() : '';

  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: 'نام کلید شناخته‌شده نیست.' }, { status: 400 });
  }
  if (!value) {
    // خالی گذاشتن یعنی «تغییر نده»، نه «پاک کن» — پاک کردن کار DELETE است.
    return NextResponse.json({ error: 'مقدار کلید خالی است.' }, { status: 400 });
  }

  try {
    saveSecret(name, encryptSecret(value), lastFour(value));
  } catch (error) {
    console.error('ذخیره‌ی کلید ناموفق بود:', error);
    return NextResponse.json(
      { error: 'ذخیره‌ی کلید ناموفق بود. ENCRYPTION_KEY را بررسی کنید.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ secrets: listSecrets() });
}

export async function DELETE(request: Request) {
  const name = new URL(request.url).searchParams.get('name') ?? '';
  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: 'نام کلید شناخته‌شده نیست.' }, { status: 400 });
  }
  deleteSecret(name);
  return NextResponse.json({ secrets: listSecrets() });
}
