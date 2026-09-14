import { NextResponse } from 'next/server';
import { getSettings, setSetting } from '@/lib/db';

export const revalidate = 0;

/** کلیدهایی که پنل اجازه‌ی نوشتنشان را دارد. */
const ALLOWED = new Set([
  'session_duration_seconds',
  'openai_realtime_model',
  'openai_voice',
  'bey_avatar_id',
  'noise_cancellation',
  'record_transcripts',
  'transcript_retention_days',
]);

export async function GET() {
  return NextResponse.json({ settings: getSettings() });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  const rejected: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    // فهرست سفید عمدی است: بدون آن، پنل می‌توانست هر کلیدی در جدول تنظیمات
    // بنویسد، از جمله کلیدهایی که کد دیگری معنای دیگری برایشان قائل است.
    if (!ALLOWED.has(key)) {
      rejected.push(key);
      continue;
    }
    setSetting(key, String(value ?? '').trim());
  }

  if (rejected.length > 0) {
    return NextResponse.json(
      { error: `این تنظیم‌ها شناخته‌شده نیستند: ${rejected.join('، ')}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ settings: getSettings() });
}
