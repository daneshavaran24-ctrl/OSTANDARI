import { NextResponse } from 'next/server';
import {
  deleteConversation,
  getConversationMessages,
  getSettings,
  listConversations,
  purgeOldConversations,
} from '@/lib/db';

export const revalidate = 0;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id');

  if (id !== null) {
    const conversationId = Number(id);
    if (!Number.isInteger(conversationId)) {
      return NextResponse.json({ error: 'شناسه‌ی گفت‌وگو نامعتبر است.' }, { status: 400 });
    }
    return NextResponse.json({ messages: getConversationMessages(conversationId) });
  }

  // ایجنت هم در پایان هر نشست پاک‌سازی می‌کند، ولی اگر مدتی هیچ گفت‌وگویی نبوده
  // باشد، رونوشت‌های منقضی همچنان روی دیسک‌اند. باز کردن همین صفحه هم آن‌ها را
  // پاک می‌کند، تا آنچه ادمین می‌بیند با مدت نگه‌داری بخواند.
  const retention = Number(getSettings().transcript_retention_days ?? 30);
  if (Number.isFinite(retention)) purgeOldConversations(retention);

  const limit = Math.min(Number(params.get('limit') ?? 50) || 50, 200);
  const offset = Math.max(Number(params.get('offset') ?? 0) || 0, 0);
  return NextResponse.json({ conversations: listConversations(limit, offset) });
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'شناسه‌ی گفت‌وگو نامعتبر است.' }, { status: 400 });
  }
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
