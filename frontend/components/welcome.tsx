'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

interface WelcomeProps {
  disabled: boolean;
  startButtonText: string;
  requiresAccessCode?: boolean;
  errorMessage?: string | null;
  onStartCall: (accessCode?: string) => void;
}

export const Welcome = ({
  disabled,
  startButtonText,
  requiresAccessCode = false,
  errorMessage = null,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeProps) => {
  const [accessCode, setAccessCode] = useState('');

  const canStart = !requiresAccessCode || accessCode.trim().length > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canStart) return;
    onStartCall(requiresAccessCode ? accessCode.trim() : undefined);
  };

  return (
    <div
      ref={ref}
      inert={disabled}
      className="fixed inset-0 z-10 mx-auto flex h-svh flex-col items-center justify-center px-4 text-center"
    >
      <Image src="/logo.png" width={475} height={125} alt="Logo" className="mb-4" priority />

      <p className="text-fg1 max-w-prose pt-1 leading-6 font-medium">
        گفت‌وگوی زنده با دستیار هوشمند پشتیبانی
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex w-64 flex-col items-center gap-3">
        {requiresAccessCode && (
          <>
            <label htmlFor="access-code" className="sr-only">
              کد دسترسی
            </label>
            <input
              id="access-code"
              type="password"
              dir="ltr"
              autoComplete="one-time-code"
              placeholder="کد دسترسی"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? 'access-code-error' : undefined}
              className="border-separator1 bg-bg2 w-full rounded-md border px-3 py-2 text-center text-sm outline-none focus:border-transparent focus:ring-2"
            />
          </>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!canStart}
          className="w-full font-mono"
        >
          {startButtonText}
        </Button>

        {errorMessage && (
          <p id="access-code-error" role="alert" className="text-fgSerious text-sm">
            {errorMessage}
          </p>
        )}
      </form>

      <p className="text-fg1 m fixed bottom-5 left-1/2 w-full max-w-prose -translate-x-1/2 pt-1 text-xs leading-5 font-normal text-pretty md:text-sm">
        پیش از شروع، میکروفون خود را فعال کنید. برای بررسی مشکل، دستیار ممکن است از شما بخواهد
        صفحه‌ی نمایشتان را به اشتراک بگذارید.
      </p>
    </div>
  );
};
