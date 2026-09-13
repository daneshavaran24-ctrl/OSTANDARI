import { headers } from 'next/headers';
import { getAppConfig } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const hdrs = await headers();
  const { companyName, logo, logoDark } = await getAppConfig(hdrs);

  return (
    <>
      <header className="fixed start-0 top-0 z-50 hidden w-full flex-row justify-between p-6 md:flex">
        <div className="flex items-center gap-3">
          <img src={logo} alt={`نشان ${companyName}`} className="block size-6 dark:hidden" />
          <img
            src={logoDark ?? logo}
            alt={`نشان ${companyName}`}
            className="hidden size-6 dark:block"
          />
          <span className="text-foreground text-sm font-bold">{companyName}</span>
        </div>
        <span className="text-foreground text-xs font-bold">پشتیبانی فنی — دستیار هوشمند</span>
      </header>
      {children}
    </>
  );
}
