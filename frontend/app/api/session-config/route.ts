import { NextResponse } from 'next/server';
import { getSessionDurationSeconds } from '@/lib/db';

export const revalidate = 0;

/**
 * پیکربندی عمومی نشست.
 *
 * بدون احراز هویت است چون مدت نشست راز نیست — کاربر به هر حال شمارش معکوس را
 * می‌بیند. اجرای واقعی مهلت سمت ایجنت است، نه اینجا.
 */
export async function GET() {
  return NextResponse.json(
    { sessionDurationSeconds: getSessionDurationSeconds() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
