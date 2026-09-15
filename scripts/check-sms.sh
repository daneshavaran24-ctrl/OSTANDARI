#!/usr/bin/env bash
#
# سنجش کلید قاصدک، پیش از اینکه یک گفت‌وگوی واقعی به‌خاطرش شکست بخورد.
#
# عمداً همان کد تولیدی (`agent/src/sms.py`) را صدا می‌زند، نه یک curl جداگانه:
# یک نسخه‌ی دوم از پروتکل یعنی جایی که می‌تواند با نسخه‌ی اصلی واگرا شود و
# این اسکریپت دقیقاً همان‌جا بی‌فایده می‌شود.
#
# استفاده:
#   GHASEDAK_API_KEY=... scripts/check-sms.sh                  # فقط خواندن اعتبار
#   GHASEDAK_API_KEY=... GHASEDAK_LINE_NUMBER=3000... \
#     scripts/check-sms.sh --send 09121234567 --text "سلام"    # ارسال واقعی
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

RECEPTOR=""
TEXT="آزمایش اتصال دستیار استانداری"

while [ $# -gt 0 ]; do
  case "$1" in
    --send) RECEPTOR="${2:-}"; shift 2 ;;
    --text) TEXT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '3,12p' "$0"; exit 0 ;;
    *) echo "گزینه‌ی ناشناخته: $1" >&2; exit 2 ;;
  esac
done

if [ -z "${GHASEDAK_API_KEY:-}" ]; then
  echo "✗ متغیر GHASEDAK_API_KEY تنظیم نشده است." >&2
  echo "  کلید را در خط فرمان ننویسید؛ از فایل محیطی بخوانیدش." >&2
  exit 2
fi

# --- اعتبار حساب: بدون هزینه ---
# کلید از طریق محیط می‌رود، نه آرگومان: آرگومان‌ها در ps برای بقیه‌ی کاربران
# سیستم دیدنی‌اند.
cd "$ROOT/agent"
uv run python -c '
import asyncio, os, sys
sys.path.insert(0, "src")
import sms

async def main():
    payload = await sms.account_information(os.environ["GHASEDAK_API_KEY"])
    data = payload.get("data") or payload.get("Data") or {}
    credit = data.get("credit", data.get("Credit", "نامعلوم"))
    print(f"✓ کلید پذیرفته شد. اعتبار حساب: {credit}")

try:
    asyncio.run(main())
except sms.SmsError as e:
    print(f"✗ {e}", file=sys.stderr)
    sys.exit(1)
'

[ -n "$RECEPTOR" ] || exit 0

# --- ارسال واقعی: هزینه دارد و برگشت‌ناپذیر است ---
if [ -z "${GHASEDAK_LINE_NUMBER:-}" ]; then
  echo "✗ برای ارسال، GHASEDAK_LINE_NUMBER هم لازم است." >&2
  exit 2
fi

echo
echo "یک پیامک واقعی به $RECEPTOR فرستاده می‌شود:"
echo "  «$TEXT»"
echo "این کار اعتبار مصرف می‌کند و قابل برگشت نیست."
read -r -p "ادامه؟ (بله/خیر) " answer
case "$answer" in
  بله|y|Y|yes) ;;
  *) echo "لغو شد؛ پیامکی فرستاده نشد."; exit 0 ;;
esac

RECEPTOR="$RECEPTOR" TEXT="$TEXT" uv run python -c '
import asyncio, os, sys, uuid
sys.path.insert(0, "src")
import guards, sms

async def main():
    target = guards.normalize_mobile(os.environ["RECEPTOR"])
    text = guards.validate_sms_text(os.environ["TEXT"])
    result = await sms.send_single(
        api_key=os.environ["GHASEDAK_API_KEY"],
        line_number=os.environ["GHASEDAK_LINE_NUMBER"],
        receptor=target,
        message=text,
        client_reference_id=uuid.uuid4().hex,
    )
    print(f"✓ پیامک به {target} فرستاده شد (شناسه: {result.message_id})")

try:
    asyncio.run(main())
except guards.GuardError as e:
    print(f"✗ ورودی پذیرفته نشد: {e}", file=sys.stderr)
    sys.exit(2)
except sms.SmsError as e:
    print(f"✗ {e}", file=sys.stderr)
    sys.exit(1)
'
