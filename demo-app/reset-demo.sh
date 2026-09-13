#!/usr/bin/env bash
# وضعیت اولیه‌ی دمو را برمی‌گرداند: کاربر maxman123 دوباره مسدود می‌شود.
# بعد از هر بار اجرای سناریو این را اجرا کنید تا دمو قابل تکرار باشد.
set -euo pipefail
printf 'maxman123\n' > "$(dirname "$0")/public/blockusers.txt"
echo "✓ کاربر maxman123 دوباره مسدود شد — دمو آماده‌ی اجرای مجدد است."
