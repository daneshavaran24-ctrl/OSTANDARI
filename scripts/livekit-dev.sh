#!/usr/bin/env bash
#
# یک سرور LiveKit محلی برای آزمون‌های زنده.
#
# کلید و راز ثابت‌اند (devkey/secret) — همان چیزی که خود livekit-server در حالت
# توسعه می‌سازد. این‌ها راز نیستند و نباید در تولید استفاده شوند.
#
# ترتیب انتخاب: متغیر LIVEKIT_SERVER_BIN، بعد باینری روی PATH، بعد داکر.
set -euo pipefail

PORT="${LIVEKIT_DEV_PORT:-7880}"

# --bind 0.0.0.0 لازم است: پیش‌فرض روی [::1] گوش می‌دهد و در محیط‌هایی که
# IPv6 ندارند (از جمله بیشتر کانتینرهای CI) با «address family not supported»
# بالا نمی‌آید.
#
# --node-ip 127.0.0.1 هم لازم است: وگرنه سرور نشانی داخلی کانتینر را به‌عنوان
# کاندیدای ICE اعلام می‌کند و مرورگرِ همان دستگاه نمی‌تواند به آن وصل شود.
# agents.target_load روی ۱ گذاشته می‌شود: پیش‌فرض ۰٫۷ است و روی یک ماشین
# شلوغ (CI یا کانتینر توسعه) سرور کارگر ایجنت را «در دسترس نیست» می‌شمارد و
# کار را اعزام نمی‌کند — با پیام «no servers available». این ربطی به درستی
# پیکربندی ندارد و فقط تست را بی‌دلیل قرمز می‌کند.
CONFIG="port: ${PORT}
agents:
  target_load: 1.0"

BASE_ARGS=(--dev --bind 0.0.0.0 --node-ip 127.0.0.1)
ARGS=("${BASE_ARGS[@]}" --config-body "$CONFIG")

# ⚠️ نام فیلدهای بخش `agents` بین نسخه‌های سرور عوض شده است و سرور در برابر
# فیلد ناشناس **بالا نمی‌آید**، نه اینکه نادیده‌اش بگیرد. اندازه‌گیری شد:
#
#   ۱٫۹٫۱  → field agents not found in type config.Config
#   ۱٫۱۰٫۰ → field target_load not found in type agent.Config
#
# پس پیکربندی یک بار امتحان می‌شود و اگر سرور نپذیرفتش، بدون آن اجرا می‌شود.
# بدیلِ این کار، اسکریپتی است که فقط روی یک نسخه‌ی خاص کار می‌کند و روی بقیه
# با پیامی که ربطی به تست ندارد می‌میرد.
start() {
  local binary="$1"
  shift
  local log
  log="$(mktemp)"

  "$binary" "$@" --config-body "$CONFIG" > "$log" 2>&1 &
  local pid=$!

  # فرصت کوتاه: خطای تجزیه‌ی پیکربندی بی‌درنگ رخ می‌دهد، نه بعد از بالا آمدن.
  sleep 2

  if kill -0 "$pid" 2> /dev/null; then
    cat "$log"
    rm -f "$log"
    wait "$pid"
    return
  fi

  if grep -q "could not parse config" "$log"; then
    echo "هشدار: این نسخه‌ی سرور پیکربندی agents را نمی‌شناسد؛ بدون آن اجرا می‌شود." >&2
  else
    cat "$log" >&2
  fi
  rm -f "$log"

  exec "$binary" "$@"
}

if [ -n "${LIVEKIT_SERVER_BIN:-}" ]; then
  start "$LIVEKIT_SERVER_BIN" "${BASE_ARGS[@]}"
  exit $?
fi

if command -v livekit-server > /dev/null 2>&1; then
  start livekit-server "${BASE_ARGS[@]}"
  exit $?
fi

if command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
  exec docker run --rm --network host livekit/livekit-server:latest "${ARGS[@]}"
fi

cat >&2 <<'MESSAGE'
سرور LiveKit پیدا نشد. یکی از این‌ها را فراهم کنید:

  * داکر:            https://docs.docker.com/get-docker/
  * باینری رسمی:     https://github.com/livekit/livekit/releases
  * یا مسیر باینری را در LIVEKIT_SERVER_BIN بگذارید

یا اگر سرور دیگری دارید (مثلاً LiveKit Cloud)، LIVEKIT_URL، LIVEKIT_API_KEY و
LIVEKIT_API_SECRET را تنظیم کنید تا این اسکریپت اصلاً اجرا نشود.
MESSAGE
exit 1
