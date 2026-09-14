import { useCallback, useEffect, useState } from 'react';

const DEFAULT_SECONDS = 30;

/**
 * مدت مجاز هر گفت‌وگو را از سرور می‌گیرد.
 *
 * این مقدار فقط برای نمایش شمارش معکوس است. اجرای واقعی مهلت سمت ایجنت انجام
 * می‌شود، چون هر کسی می‌تواند جاوااسکریپت مرورگر را دور بزند.
 */
export function useSessionDuration(): number {
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session-config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const value = Number(data?.sessionDurationSeconds);
        if (!cancelled && Number.isFinite(value) && value > 0) setSeconds(value);
      })
      .catch(() => {
        // اگر نشد، همان پیش‌فرض می‌ماند؛ ایجنت به هر حال مهلت را اعمال می‌کند.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return seconds;
}

/** ثانیه را به قالب «م:ثث» درمی‌آورد. */
export function formatRemaining(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * ثانیه‌های باقی‌مانده در یک لحظه‌ی مشخص.
 *
 * بر اساس ساعت واقعی حساب می‌شود، نه شمردن تیک‌ها: مرورگر تایمرِ تبِ پس‌زمینه
 * را کند می‌کند و شمارشِ تیکی عقب می‌افتد، یعنی کاربر می‌توانست با کوچک کردن
 * پنجره وقت بیشتری بگیرد.
 *
 * جدا از هوک نوشته شده تا بشود بدون رندر و بدون تایمر آزمودش.
 */
export function remainingAt(durationSeconds: number, startedAt: number, now: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.max(0, durationSeconds - elapsed);
}

/**
 * شمارش معکوس نشست.
 *
 * وقتی `running` درست شود از `durationSeconds` شروع می‌کند و در صفر `onExpire`
 * را دقیقاً یک بار صدا می‌زند.
 */
export function useCountdown(
  durationSeconds: number,
  running: boolean,
  onExpire: () => void
): number {
  const [remaining, setRemaining] = useState(durationSeconds);
  const expire = useCallback(onExpire, [onExpire]);

  useEffect(() => {
    if (!running) {
      setRemaining(durationSeconds);
      return;
    }

    const startedAt = Date.now();
    let fired = false;
    const tick = () => {
      const left = remainingAt(durationSeconds, startedAt, Date.now());
      setRemaining(left);
      // تایمر تا پاک شدن افکت باز است؛ بدون این نگهبان، onExpire هر نیم ثانیه
      // دوباره صدا زده می‌شد و قطع تماس چند بار اجرا می‌شد.
      if (left <= 0 && !fired) {
        fired = true;
        expire();
      }
    };

    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [durationSeconds, running, expire]);

  return remaining;
}
