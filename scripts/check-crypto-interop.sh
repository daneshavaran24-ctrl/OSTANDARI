#!/usr/bin/env bash
#
# بررسی هم‌قالب بودن رمزنگاری بین Next.js و ایجنت پایتون، در هر دو جهت.
#
# پنل ادمین کلیدها را رمز می‌کند و ایجنت رمزگشایی می‌کند. اگر قالب دو طرف واگرا
# شود، کلیدها بی‌صدا غیرقابل‌خواندن می‌شوند و هیچ تست تک‌زبانه‌ای آن را نمی‌گیرد.
# به همین دلیل این بررسی جداست و در CI اجرا می‌شود.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="$(openssl rand -base64 32)"
SAMPLE='sk-proj-نمونه-۱۲۳-AbCdEf'

fail() { echo "✗ $1" >&2; exit 1; }

# فایل موقت نباید بعد از خطا در درخت کار جا بماند.
TEMP_TS="$ROOT/frontend/.crypto-interop.ts"
trap 'rm -f "$TEMP_TS"' EXIT

# --- جهت ۱: Node رمز می‌کند، پایتون می‌خواند ---
cat > "$TEMP_TS" <<'TS'
import { encryptSecret } from './lib/crypto';
process.stdout.write(encryptSecret(process.env.SAMPLE!));
TS
BLOB="$(cd "$ROOT/frontend" && ENCRYPTION_KEY="$KEY" SAMPLE="$SAMPLE" npx --yes tsx .crypto-interop.ts)"
rm -f "$TEMP_TS"

OUT="$(cd "$ROOT/agent" && ENCRYPTION_KEY="$KEY" BLOB="$BLOB" uv run python -c '
import os, sys, crypto
sys.stdout.write(crypto.decrypt_secret(os.environ["BLOB"]))
')"
[ "$OUT" = "$SAMPLE" ] || fail "Node → پایتون: انتظار «$SAMPLE» ولی «$OUT» آمد"
echo "✓ Node رمز کرد، پایتون درست خواند"

# --- جهت ۲: پایتون رمز می‌کند، Node می‌خواند ---
BLOB="$(cd "$ROOT/agent" && ENCRYPTION_KEY="$KEY" SAMPLE="$SAMPLE" uv run python -c '
import os, sys, crypto
sys.stdout.write(crypto.encrypt_secret(os.environ["SAMPLE"]))
')"

cat > "$TEMP_TS" <<'TS'
import { decryptSecret } from './lib/crypto';
process.stdout.write(decryptSecret(process.env.BLOB!));
TS
OUT="$(cd "$ROOT/frontend" && ENCRYPTION_KEY="$KEY" BLOB="$BLOB" npx --yes tsx .crypto-interop.ts)"
rm -f "$TEMP_TS"

[ "$OUT" = "$SAMPLE" ] || fail "پایتون → Node: انتظار «$SAMPLE» ولی «$OUT» آمد"
echo "✓ پایتون رمز کرد، Node درست خواند"

echo "✓ قالب رمزنگاری دو سمت یکی است"
