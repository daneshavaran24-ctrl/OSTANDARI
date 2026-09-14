"""
رمزگشایی کلیدهای API که پنل ادمین در پایگاه داده ذخیره کرده است.

⚠️ قالب این فایل باید **دقیقاً** با `frontend/lib/crypto.ts` یکی بماند. پنل
رمز می‌کند و اینجا رمزگشایی می‌شود؛ اگر قالب دو طرف واگرا شود، کلیدها بی‌صدا
غیرقابل‌خواندن می‌شوند و فقط موقع اجرای واقعی معلوم می‌شود. تست رفت‌وبرگشت
دوزبانه در tests/test_crypto.py نگهبان همین است.

قالب: base64( iv[12] ‖ tag[16] ‖ ciphertext )  با AES-256-GCM
"""

import base64
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_LENGTH = 12
TAG_LENGTH = 16
KEY_LENGTH = 32


class EncryptionKeyError(RuntimeError):
    """کلید رمزنگاری تنظیم نشده یا نامعتبر است."""


class DecryptionError(RuntimeError):
    """داده‌ی رمزشده قابل خواندن نیست."""


def encryption_key() -> bytes:
    """کلید ۳۲ بایتی را از ENCRYPTION_KEY (base64) می‌خواند."""
    raw = os.getenv("ENCRYPTION_KEY", "").strip()
    if not raw:
        raise EncryptionKeyError(
            "ENCRYPTION_KEY تنظیم نشده است. با این دستور یکی بسازید: "
            "openssl rand -base64 32"
        )

    try:
        key = base64.b64decode(raw, validate=True)
    except Exception as e:
        raise EncryptionKeyError("ENCRYPTION_KEY یک base64 معتبر نیست.") from e

    if len(key) != KEY_LENGTH:
        raise EncryptionKeyError(
            f"ENCRYPTION_KEY باید {KEY_LENGTH} بایت باشد (base64)، "
            f"ولی {len(key)} بایت است."
        )
    return key


def encrypt_secret(plaintext: str) -> str:
    """
    رمزنگاری، هم‌قالب با سمت Next.js.

    ایجنت در عمل رمز نمی‌کند — این تابع برای تست رفت‌وبرگشت دوزبانه و ابزارهای
    خط فرمان است.
    """
    if not plaintext:
        raise ValueError("مقدار خالی قابل رمزنگاری نیست.")

    iv = os.urandom(IV_LENGTH)
    blob = AESGCM(encryption_key()).encrypt(iv, plaintext.encode("utf-8"), None)
    # خروجی AESGCM به شکل ciphertext ‖ tag است، ولی قالب مشترک tag را قبل از
    # داده می‌خواهد تا با createCipheriv نود بخواند.
    ciphertext, tag = blob[:-TAG_LENGTH], blob[-TAG_LENGTH:]
    return base64.b64encode(iv + tag + ciphertext).decode("ascii")


def decrypt_secret(encoded: str) -> str:
    """رمزگشایی مقداری که پنل ادمین ذخیره کرده است."""
    try:
        blob = base64.b64decode(encoded, validate=True)
    except Exception as e:
        raise DecryptionError("داده‌ی رمزشده base64 معتبر نیست.") from e

    if len(blob) <= IV_LENGTH + TAG_LENGTH:
        raise DecryptionError("داده‌ی رمزشده ناقص است.")

    iv = blob[:IV_LENGTH]
    tag = blob[IV_LENGTH : IV_LENGTH + TAG_LENGTH]
    ciphertext = blob[IV_LENGTH + TAG_LENGTH :]

    try:
        plaintext = AESGCM(encryption_key()).decrypt(iv, ciphertext + tag, None)
    except InvalidTag as e:
        raise DecryptionError(
            "رمزگشایی ناموفق بود. یا ENCRYPTION_KEY عوض شده یا داده دستکاری شده است."
        ) from e

    return plaintext.decode("utf-8")
