"""
تست‌های رمزنگاری کلیدهای API.

توجه: این تست‌ها فقط رفت‌وبرگشت **داخل پایتون** را می‌سنجند. هم‌قالب بودن با
سمت Next.js را `scripts/check-crypto-interop.sh` بررسی می‌کند و در CI اجرا
می‌شود — چون یک قالب واگرا می‌تواند در هر دو زبان جداگانه سبز بماند و فقط در
عبور از یکی به دیگری بشکند.
"""

import base64

import pytest

import crypto
from crypto import DecryptionError, EncryptionKeyError

VALID_KEY = base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("ENCRYPTION_KEY", VALID_KEY)


# ---------------------------------------------------------------------------
# کلید
# ---------------------------------------------------------------------------


def test_missing_key_raises_with_a_usable_hint(monkeypatch):
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    with pytest.raises(EncryptionKeyError) as err:
        crypto.encryption_key()
    # پیام باید بگوید چطور کلید بسازند، نه فقط اینکه نیست
    assert "openssl" in str(err.value)


@pytest.mark.parametrize(
    "bad",
    [
        base64.b64encode(b"too-short").decode(),
        base64.b64encode(b"x" * 64).decode(),
    ],
)
def test_wrong_length_key_raises(monkeypatch, bad):
    monkeypatch.setenv("ENCRYPTION_KEY", bad)
    with pytest.raises(EncryptionKeyError):
        crypto.encryption_key()


def test_non_base64_key_raises(monkeypatch):
    monkeypatch.setenv("ENCRYPTION_KEY", "این base64 نیست!!!")
    with pytest.raises(EncryptionKeyError):
        crypto.encryption_key()


# ---------------------------------------------------------------------------
# رفت‌وبرگشت
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "secret",
    [
        "sk-proj-abc123",
        "کلید با متن فارسی",
        "a",
        "x" * 5000,
        "با فاصله و نماد !@#$%^&*()",
    ],
)
def test_round_trip(secret):
    assert crypto.decrypt_secret(crypto.encrypt_secret(secret)) == secret


def test_same_plaintext_gives_different_ciphertext():
    """
    هر بار iv تازه ساخته می‌شود، پس دو رمزنگاری از یک مقدار نباید یکسان باشد —
    وگرنه از روی دیتابیس می‌شد فهمید دو کلید مثل هم‌اند.
    """
    a = crypto.encrypt_secret("same")
    b = crypto.encrypt_secret("same")
    assert a != b
    assert crypto.decrypt_secret(a) == crypto.decrypt_secret(b) == "same"


def test_empty_value_is_rejected():
    with pytest.raises(ValueError):
        crypto.encrypt_secret("")


# ---------------------------------------------------------------------------
# دستکاری و کلید اشتباه
# ---------------------------------------------------------------------------


def test_wrong_key_cannot_decrypt(monkeypatch):
    blob = crypto.encrypt_secret("راز")
    monkeypatch.setenv("ENCRYPTION_KEY", base64.b64encode(b"z" * 32).decode())
    with pytest.raises(DecryptionError):
        crypto.decrypt_secret(blob)


def test_tampered_ciphertext_is_rejected():
    """
    GCM احراز اصالت دارد: تغییر یک بایت باید خطا بدهد، نه متن آشغال. اگر این
    بشکند یعنی کسی حالت رمزنگاری را به چیزی بدون احراز اصالت عوض کرده است.
    """
    blob = bytearray(base64.b64decode(crypto.encrypt_secret("راز")))
    blob[-1] ^= 0xFF
    with pytest.raises(DecryptionError):
        crypto.decrypt_secret(base64.b64encode(bytes(blob)).decode())


@pytest.mark.parametrize("bad", ["", "!!!", base64.b64encode(b"short").decode()])
def test_malformed_input_is_rejected(bad):
    with pytest.raises(DecryptionError):
        crypto.decrypt_secret(bad)
