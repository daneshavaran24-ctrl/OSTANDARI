/**
 * تشخیص اینکه یک نام کاربری در فهرست مسدودشده‌ها هست یا نه.
 *
 * از Login.tsx جدا شده تا قابل تست باشد. فایل blockusers.txt را ایجنت پشتیبانی
 * روی دیسک ویرایش می‌کند، پس قالبش باید با آنچه ایجنت می‌نویسد بخواند.
 */

/** فقط خودِ نام کاربری را از `\دامنه\نام‌کاربری` بیرون می‌کشد. */
export function extractUsername(input: string): string {
  return input.split('\\').pop()?.trim().toLowerCase() ?? '';
}

/** فهرست را به نام‌های نرمال‌شده تبدیل می‌کند، خط‌های خالی حذف می‌شوند. */
export function parseBlockedUsers(fileContents: string): string[] {
  return fileContents
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
}

export function isBlocked(username: string, fileContents: string): boolean {
  const target = extractUsername(username);
  if (!target) return false;
  return parseBlockedUsers(fileContents).includes(target);
}
