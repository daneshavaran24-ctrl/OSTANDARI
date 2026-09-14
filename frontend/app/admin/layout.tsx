import { AdminNav } from '@/components/admin-nav';

export const metadata = { title: 'پنل مدیریت — دستیار استانداری' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh">
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
