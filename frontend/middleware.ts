import { type NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, tokenIsValid } from '@/lib/admin-token';

/**
 * محافظت یک‌نقطه‌ای از پنل ادمین.
 *
 * همه‌ی مسیرهای /admin و /api/admin پشت کوکی امضاشده‌اند. یک نقطه به‌جای بررسی
 * پراکنده در هر فایل: اضافه کردن یک صفحه‌ی تازه به پنل نباید بتواند به‌اشتباه
 * بدون محافظت بماند.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // خود صفحه‌ی ورود و API ورود باید باز بمانند، وگرنه حلقه می‌شود.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  if (await tokenIsValid(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // درخواست API پاسخ JSON می‌گیرد، مرورگر به صفحه‌ی ورود می‌رود.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'برای این کار باید وارد پنل شوید.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const login = new URL('/admin/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
