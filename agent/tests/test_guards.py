"""
تست‌های اعتبارسنجی و سقف ابزارها.

این‌ها مرز امنیتی ایجنت‌اند: آرگومان‌های ابزار را یک مدل زبانی تولید می‌کند و
کاربر در گفت‌وگو دیکته می‌کند، پس ورودی غیرقابل‌اعتمادند.
"""

import pytest

import guards
from guards import GuardError


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    guards.reset_usage()
    for var in (
        "EMAIL_ALLOWED_DOMAINS",
        "EMAIL_MAX_PER_SESSION",
        "UNBLOCK_MAX_PER_SESSION",
    ):
        monkeypatch.delenv(var, raising=False)
    yield
    guards.reset_usage()


# ---------------------------------------------------------------------------
# نشانی ایمیل
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "address",
    ["user@example.com", "first.last+tag@sub.example.co.uk", "  a@b.io  "],
)
def test_accepts_valid_addresses(address):
    assert "@" in guards.validate_email_address(address)


@pytest.mark.parametrize(
    "address",
    [
        "",
        "   ",
        "no-at-sign",
        "missing@tld",
        "@example.com",
        "user@",
        "user@@example.com",
        "user name@example.com",
    ],
)
def test_rejects_invalid_addresses(address):
    with pytest.raises(GuardError):
        guards.validate_email_address(address)


@pytest.mark.parametrize(
    "address",
    [
        "victim@example.com\nBcc: attacker@evil.com",
        "victim@example.com\r\nBcc: attacker@evil.com",
    ],
)
def test_rejects_header_injection_in_address(address):
    """
    خط جدید در نشانی یعنی مهاجم می‌تواند سرتیتر Bcc اضافه کند و رونوشت پنهان
    بگیرد. این باید رد شود، نه اینکه به SMTP برسد.
    """
    with pytest.raises(GuardError):
        guards.validate_email_address(address)


def test_domain_allowlist_blocks_outsiders(monkeypatch):
    monkeypatch.setenv("EMAIL_ALLOWED_DOMAINS", "ostandari.ir, example.com")
    assert guards.validate_email_address("a@example.com")
    with pytest.raises(GuardError) as err:
        guards.validate_email_address("a@evil.com")
    assert "evil.com" in str(err.value)


def test_empty_allowlist_allows_everything():
    """بدون تنظیم، محدودیتی نیست — ولی tools.py باید هشدار لاگ کند."""
    assert guards.allowed_email_domains() == []
    assert guards.validate_email_address("anyone@anywhere.org")


# ---------------------------------------------------------------------------
# محتوای ایمیل
# ---------------------------------------------------------------------------


def test_rejects_empty_subject_or_message():
    with pytest.raises(GuardError):
        guards.validate_email_content("", "متن")
    with pytest.raises(GuardError):
        guards.validate_email_content("موضوع", "   ")


def test_rejects_header_injection_in_subject():
    with pytest.raises(GuardError):
        guards.validate_email_content("سلام\nBcc: attacker@evil.com", "متن")


def test_rejects_oversized_content():
    with pytest.raises(GuardError):
        guards.validate_email_content("م" * 201, "متن")
    with pytest.raises(GuardError):
        guards.validate_email_content("موضوع", "م" * 10_001)


def test_accepts_content_at_the_limit():
    """مرز دقیق باید قابل قبول باشد، نه یکی کمتر."""
    subject, message = guards.validate_email_content("م" * 200, "م" * 10_000)
    assert len(subject) == 200
    assert len(message) == 10_000


# ---------------------------------------------------------------------------
# سقف در هر نشست
# ---------------------------------------------------------------------------


def test_email_limit_is_enforced():
    for _ in range(3):
        guards.check_and_count("send_email", "room-1")
    with pytest.raises(GuardError) as err:
        guards.check_and_count("send_email", "room-1")
    assert "سقف" in str(err.value)


def test_limit_is_per_session():
    """سقف یک اتاق نباید اتاق دیگر را ببندد."""
    for _ in range(3):
        guards.check_and_count("send_email", "room-1")
    guards.check_and_count("send_email", "room-2")


def test_limits_are_independent_per_action():
    for _ in range(3):
        guards.check_and_count("send_email", "room-1")
    guards.check_and_count("unblock_user", "room-1")


def test_limit_is_configurable(monkeypatch):
    monkeypatch.setenv("EMAIL_MAX_PER_SESSION", "1")
    guards.check_and_count("send_email", "room-1")
    with pytest.raises(GuardError):
        guards.check_and_count("send_email", "room-1")


def test_zero_limit_blocks_everything(monkeypatch):
    monkeypatch.setenv("UNBLOCK_MAX_PER_SESSION", "0")
    with pytest.raises(GuardError):
        guards.check_and_count("unblock_user", "room-1")


@pytest.mark.parametrize("value", ["abc", "-1"])
def test_invalid_limit_config_raises(monkeypatch, value):
    monkeypatch.setenv("EMAIL_MAX_PER_SESSION", value)
    with pytest.raises(GuardError):
        guards.check_and_count("send_email", "room-1")


# ---------------------------------------------------------------------------
# نام کاربری
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        "\\vienna\\maxman123",
        "vienna\\maxman123",
        "maxman123",
        "/vienna/maxman123",
        "  MaxMan123  ",
        "VIENNA\\MAXMAN123",
    ],
)
def test_username_normalises_every_format_the_model_might_send(raw):
    """
    مدل ممکن است هر یک از این قالب‌ها را بفرستد، ولی فایل مسدودی فقط خودِ نام
    کاربری را نگه می‌دارد.
    """
    assert guards.normalize_username(raw) == "maxman123"


def test_empty_username_raises():
    with pytest.raises(GuardError):
        guards.normalize_username("   ")
