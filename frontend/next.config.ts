import type { NextConfig } from 'next';

/**
 * سیاست امنیت محتوا.
 *
 * این برنامه صدا و تصویر زنده دارد، پس یک CSP سخت‌گیرانه‌ی معمولی آن را
 * می‌شکند. موارد زیر عمدی‌اند و بدونشان اتصال قطع می‌شود:
 *
 *   connect-src wss: https:  → اتصال WebRTC و سیگنالینگ به سرور LiveKit،
 *                              که نشانی‌اش از متغیر محیطی می‌آید و در زمان
 *                              بیلد معلوم نیست. در حالت توسعه ws: و http: هم
 *                              اضافه می‌شوند، وگرنه سرور LiveKit محلی — که
 *                              رمزگذاری ندارد — اصلاً قابل اتصال نیست و
 *                              مرورگر با «Refused to connect» ساکت می‌ماند.
 *   media-src blob:          → ترک‌های صوتی و تصویری دریافتی
 *   img-src blob: data:      → فریم‌های ویدیو و تصاویر درون‌خطی
 *   worker-src blob:         → وب‌ورکرهای پردازش صدا در livekit-client
 *
 * 'unsafe-inline' برای استایل لازم است چون Next استایل‌های درون‌خطی تزریق
 * می‌کند. برای اسکریپت در حالت توسعه 'unsafe-eval' لازم است؛ در تولید حذف
 * می‌شود.
 */
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `connect-src 'self' wss: https:${isDev ? ' ws: http:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // فقط میکروفون، دوربین و اشتراک صفحه لازم است؛ بقیه بسته می‌شوند
  {
    key: 'Permissions-Policy',
    value: 'microphone=(self), camera=(self), display-capture=(self), geolocation=(), payment=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
