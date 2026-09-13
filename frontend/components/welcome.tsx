import Image from 'next/image';
import { Button } from '@/components/ui/button';

interface WelcomeProps {
  disabled: boolean;
  startButtonText: string;
  onStartCall: () => void;
}

export const Welcome = ({
  disabled,
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeProps) => {
  return (
    <div
      ref={ref}
      inert={disabled}
      className="fixed inset-0 z-10 mx-auto flex h-svh flex-col items-center justify-center text-center"
    >
      <Image src="/logo.png" width={475} height={125} alt="Logo" className="mb-4" priority />

      <p className="text-fg1 max-w-prose pt-1 leading-6 font-medium">
        گفت‌وگوی زنده با دستیار هوشمند پشتیبانی
      </p>
      <Button variant="primary" size="lg" onClick={onStartCall} className="mt-6 w-64 font-mono">
        {startButtonText}
      </Button>
      <p className="text-fg1 m fixed bottom-5 left-1/2 w-full max-w-prose -translate-x-1/2 pt-1 text-xs leading-5 font-normal text-pretty md:text-sm">
        پیش از شروع، میکروفون خود را فعال کنید. برای بررسی مشکل، دستیار ممکن است از شما بخواهد
        صفحه‌ی نمایشتان را به اشتراک بگذارید.
      </p>
    </div>
  );
};
