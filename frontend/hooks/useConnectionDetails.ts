import { useCallback, useEffect, useState } from 'react';
import { decodeJwt } from 'jose';
import { ConnectionDetails } from '@/app/api/connection-details/route';

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

const ENDPOINT = process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';

/** خطایی که پیامش برای نمایش به کاربر مناسب است. */
export class ConnectionDetailsError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ConnectionDetailsError';
    this.status = status;
  }
}

/**
 * آیا توکن منقضی شده است؟
 *
 * `exp` در JWT برحسب ثانیه است و باید به میلی‌ثانیه تبدیل شود. یک دقیقه زودتر
 * منقضی در نظر گرفته می‌شود تا توکن وسط اتصال باطل نشود.
 *
 * جدا از هوک export شده تا قابل تست باشد — این محاسبه قبلاً غلط بود و باعث
 * می‌شد اتصال بعد از ۱۵ دقیقه بی‌صدا بمیرد.
 */
export function isTokenExpired(token: string | undefined, now: number = Date.now()): boolean {
  if (!token) return true;

  let exp: number | undefined;
  try {
    exp = decodeJwt(token).exp;
  } catch {
    return true;
  }
  if (!exp) return true;

  return exp * 1000 - ONE_MINUTE_IN_MILLISECONDS <= now;
}

export default function useConnectionDetails() {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [requiresAccessCode, setRequiresAccessCode] = useState(false);

  // فقط می‌پرسیم که آیا کد لازم است یا نه؛ خود کد هرگز به کلاینت نمی‌آید.
  useEffect(() => {
    let cancelled = false;
    fetch(ENDPOINT, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { requiresAccessCode: false }))
      .then((data) => {
        if (!cancelled) setRequiresAccessCode(Boolean(data?.requiresAccessCode));
      })
      .catch(() => {
        // اگر این درخواست شکست بخورد، فیلد کد نشان داده نمی‌شود؛ سرور در هر
        // حال درخواست بدون کد را رد می‌کند و پیام خطا به کاربر می‌رسد.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchConnectionDetails = useCallback(async (accessCode?: string) => {
    setConnectionDetails(null);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(accessCode ? { accessCode } : {}),
    }).catch(() => {
      throw new ConnectionDetailsError('اتصال به سرور برقرار نشد.', 0);
    });

    if (!res.ok) {
      const message =
        res.status === 401
          ? 'کد دسترسی نادرست است.'
          : res.status === 429
            ? 'درخواست‌های بیش از حد. کمی بعد دوباره تلاش کنید.'
            : 'دریافت اطلاعات اتصال ناموفق بود.';
      throw new ConnectionDetailsError(message, res.status);
    }

    const data: ConnectionDetails = await res.json();
    setConnectionDetails(data);
    return data;
  }, []);

  const existingOrRefreshConnectionDetails = useCallback(
    async (accessCode?: string) => {
      if (!connectionDetails || isTokenExpired(connectionDetails.participantToken)) {
        return fetchConnectionDetails(accessCode);
      }
      return connectionDetails;
    },
    [connectionDetails, fetchConnectionDetails]
  );

  return {
    connectionDetails,
    requiresAccessCode,
    refreshConnectionDetails: fetchConnectionDetails,
    existingOrRefreshConnectionDetails,
  };
}
