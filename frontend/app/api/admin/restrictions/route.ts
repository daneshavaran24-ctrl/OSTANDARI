import { NextResponse } from 'next/server';
import { addRestriction, deleteRestriction, listRestrictions, updateRestriction } from '@/lib/db';

export const revalidate = 0;

const MAX_LENGTH = 500;

export async function GET() {
  return NextResponse.json({ restrictions: listRestrictions() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { topic?: unknown; response?: unknown };
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const response = typeof body.response === 'string' ? body.response.trim() : '';

  if (!topic || !response) {
    return NextResponse.json({ error: 'موضوع و پاسخ هر دو لازم‌اند.' }, { status: 400 });
  }
  if (topic.length > MAX_LENGTH || response.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `موضوع و پاسخ نباید از ${MAX_LENGTH} کاراکتر بیشتر باشند.` },
      { status: 400 }
    );
  }

  addRestriction(topic, response);
  return NextResponse.json({ restrictions: listRestrictions() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id?: unknown;
    topic?: unknown;
    response?: unknown;
    enabled?: unknown;
  };
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'شناسه‌ی محدودیت نامعتبر است.' }, { status: 400 });
  }

  updateRestriction(id, {
    topic: typeof body.topic === 'string' ? body.topic.trim() : undefined,
    response: typeof body.response === 'string' ? body.response.trim() : undefined,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
  });

  return NextResponse.json({ restrictions: listRestrictions() });
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'شناسه‌ی محدودیت نامعتبر است.' }, { status: 400 });
  }
  deleteRestriction(id);
  return NextResponse.json({ restrictions: listRestrictions() });
}
