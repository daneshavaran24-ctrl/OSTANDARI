#!/usr/bin/env bash
#
# راه‌اندازی کانتینر ترکیبی: مهاجرت، ایجنت، فرانت‌اند.
#
# ⚠️ مهم‌ترین خط این فایل `wait -n` است. بدون آن، اگر ایجنت بمیرد کانتینر
# «سالم» می‌ماند چون فرانت‌اند هنوز پاسخ می‌دهد — یعنی سایت بالاست، دکمه‌ی شروع
# کار می‌کند، و دستیار هرگز نمی‌آید. دقیقاً همان خرابی خاموشی که باید دیده شود،
# نه پنهان بماند.
set -euo pipefail

APP_ROOT=/app
FRONTEND_PORT="${PORT:-3000}"

log() { printf '[entrypoint] %s\n' "$1"; }

# --- ۱. پایگاه داده ---------------------------------------------------------
# اجرای دوباره بی‌خطر است. اگر دیسک سوار نشده باشد، این همان جایی است که
# معلوم می‌شود، نه نیم‌ساعت بعد وقتی تنظیمات ناپدید شده‌اند.
DB_DIR="$(dirname "${DATABASE_PATH:-$APP_ROOT/data/ostandari.db}")"
if [ ! -w "$DB_DIR" ]; then
  log "خطا: پوشه‌ی پایگاه داده قابل نوشتن نیست: $DB_DIR"
  log "دیسک لیارا را روی همین مسیر سوار کنید."
  exit 1
fi

log "آماده‌سازی پایگاه داده در ${DATABASE_PATH:-$APP_ROOT/data/ostandari.db}"
node "$APP_ROOT/db/migrate.mjs"

# --- ۲. فرایندها ------------------------------------------------------------
declare -a pids=()

stop_children() {
  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2> /dev/null || true
  done
  wait 2> /dev/null || true
}

on_signal() {
  log "سیگنال توقف دریافت شد؛ فرایندها بسته می‌شوند"
  stop_children
  exit 0
}
trap on_signal TERM INT

log "ایجنت صوتی اجرا می‌شود"
(
  cd "$APP_ROOT/agent"
  exec .venv/bin/python src/agent.py start
) &
pids+=("$!")

log "رابط کاربری و پنل روی پورت ${FRONTEND_PORT} اجرا می‌شود"
(
  cd "$APP_ROOT/frontend"
  exec node server.js
) &
pids+=("$!")

# --- ۳. هر کدام مرد، کانتینر می‌میرد ---------------------------------------
# `set -e` نباید اینجا اسکریپت را ساکت بکشد، وگرنه نه لاگی می‌ماند و نه
# فرایند دیگر تمیز بسته می‌شود.
status=0
wait -n || status=$?

log "یکی از فرایندها با کد $status خارج شد؛ کانتینر بسته می‌شود تا دوباره اجرا شود"
stop_children

# کد خروج واقعی برگردانده می‌شود تا سکو بفهمد این یک خرابی بوده، نه توقف عادی.
exit "$status"
