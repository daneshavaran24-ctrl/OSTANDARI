import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { accessCodeMatches, accessCodeRequired } from '@/lib/access-code';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';

// این مقادیر باید در `.env.local` تعریف شوند
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

const DEFAULT_TOKEN_TTL = '15m';

/**
 * نام ایجنتی که باید به اتاق اعزام شود.
 *
 * باید با `@server.rtc_session(agent_name=...)` در `agent/src/agent.py` یکی
 * باشد. متغیر محیطی برای استقرارهایی است که چند ایجنت دارند.
 */
const AGENT_NAME = process.env.AGENT_NAME?.trim() || 'ostandari-support';

// نتیجه هرگز کش نشود
export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

/**
 * آیا رابط کاربری باید فیلد کد دسترسی را نشان بدهد؟
 *
 * فقط همین یک بیت را برمی‌گرداند و خود کد را لو نمی‌دهد.
 */
export async function GET() {
  return NextResponse.json(
    { requiresAccessCode: accessCodeRequired() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * صدور توکن ورود به اتاق.
 *
 * POST است نه GET، تا کد دسترسی در نشانی و لاگ سرور و تاریخچه‌ی مرورگر ننشیند.
 */
export async function POST(request: Request) {
  // ۱) محدودیت نرخ، قبل از هر کار دیگری
  const limit = checkRateLimit(clientKey(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'درخواست‌های بیش از حد. کمی بعد دوباره تلاش کنید.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(limit.retryAfterSeconds),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // ۲) کد دسترسی
  if (accessCodeRequired()) {
    let accessCode: unknown;
    try {
      const body = await request.json();
      accessCode = (body as { accessCode?: unknown })?.accessCode;
    } catch {
      accessCode = undefined;
    }

    if (!accessCodeMatches(accessCode)) {
      return NextResponse.json(
        { error: 'کد دسترسی نادرست است.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  // ۳) پیکربندی سرور
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
    // جزئیات فقط در لاگ سرور می‌ماند. برگرداندن error.message خام به کلاینت
    // نام متغیرهای محیطی و وضعیت پیکربندی را لو می‌دهد.
    console.error('پیکربندی LiveKit ناقص است: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET');
    return NextResponse.json(
      { error: 'سرویس در حال حاضر پیکربندی نشده است.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${crypto.randomUUID()}`;
    const roomName = `voice_assistant_room_${crypto.randomUUID()}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken,
      participantName,
    };

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('صدور توکن ناموفق بود:', error);
    return NextResponse.json(
      { error: 'صدور توکن ناموفق بود.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

function createParticipantToken(userInfo: AccessTokenOptions, roomName: string) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: process.env.TOKEN_TTL?.trim() || DEFAULT_TOKEN_TTL,
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    // canPublishData برای RPC اعلان‌های ایجنت لازم است
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  // ⚠️ ایجنت با `agent_name` ثبت می‌شود و در LiveKit این یعنی **اعزام صریح**:
  // کار به‌صورت خودکار به هیچ اتاقی فرستاده نمی‌شود. بدون این بخش، مرورگر وصل
  // می‌شود، اتاق ساخته می‌شود، و دستیار هرگز نمی‌آید — بدون هیچ خطایی.
  //
  // این نام باید با `@server.rtc_session(agent_name=...)` در agent/src/agent.py
  // یکی بماند؛ `agent/tests/test_dispatch.py` همین را می‌سنجد.
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })],
  });

  return at.toJwt();
}
