"""
اعتبارسنجی ورودی‌ها و سقف استفاده برای ابزارهای ایجنت.

ابزارها را یک مدل زبانی صدا می‌زند، و ورودی‌هایش را کاربر در گفت‌وگو دیکته
می‌کند. یعنی آرگومان‌ها ورودی غیرقابل‌اعتمادند و باید مثل ورودی کاربر در یک
API عمومی اعتبارسنجی شوند، نه مثل مقدارهای داخلی.

از tools.py جدا نگه داشته شده تا بدون اتاق LiveKit و بدون SMTP قابل تست باشد.
"""

import os
import re
from collections import defaultdict

# ---------------------------------------------------------------------------
# سقف‌ها
# ---------------------------------------------------------------------------

DEFAULT_EMAIL_MAX_PER_SESSION = 3
DEFAULT_UNBLOCK_MAX_PER_SESSION = 5
DEFAULT_SMS_MAX_PER_SESSION = 3

MAX_SUBJECT_LENGTH = 200
MAX_MESSAGE_LENGTH = 10_000

# یک پیامک فارسی بیش از ۷۰ کاراکتر به چند بخش تقسیم می‌شود و هر بخش جدا
# حساب می‌شود. این سقف جلوی یک مدل پرحرف را می‌گیرد که ناخواسته ده بخش
# می‌فرستد و هزینه می‌سازد.
MAX_SMS_LENGTH = 600

# شمارنده‌ی استفاده به ازای هر اتاق. فرایند ایجنت برای هر اتاق زنده است، پس
# نگه داشتن در حافظه کافی است و نیازی به ذخیره‌ساز بیرونی ندارد.
_usage: dict[tuple[str, str], int] = defaultdict(int)

# ---------------------------------------------------------------------------
# اعتبارسنجی نشانی ایمیل
# ---------------------------------------------------------------------------

# عمداً محافظه‌کارانه است: هدف پذیرفتن هر نشانی معتبر RFC نیست، بلکه رد کردن
# چیزهایی است که مدل ممکن است بسازد یا کاربر اشتباه دیکته کند.
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# کاراکترهایی که اجازه‌ی تزریق سرتیتر در ایمیل را می‌دهند
_HEADER_INJECTION_RE = re.compile(r"[\r\n]")

# ---------------------------------------------------------------------------
# اعتبارسنجی شماره‌ی موبایل ایران
# ---------------------------------------------------------------------------

# ارقام فارسی و عربی، چون کاربر شماره را شفاهی می‌گوید و مدل ممکن است با هر
# کدام بنویسدش.
_PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

# قالب استاندارد پس از نرمال‌سازی: 09 و نه رقم دیگر.
_MOBILE_RE = re.compile(r"^09\d{9}$")


class GuardError(ValueError):
    """ورودی یا سقفی که ابزار نباید از آن عبور کند."""


def _limit(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as e:
        raise GuardError(f"مقدار {name} باید عدد باشد، نه {raw!r}") from e
    if value < 0:
        raise GuardError(f"مقدار {name} نمی‌تواند منفی باشد: {value}")
    return value


def allowed_email_domains() -> list[str]:
    """
    دامنه‌های مجاز برای ارسال ایمیل، از EMAIL_ALLOWED_DOMAINS.

    فهرست خالی یعنی هیچ محدودیتی نیست — که برای استقرار واقعی توصیه نمی‌شود،
    چون ایجنت عملاً می‌تواند از حساب شما به هر نشانی‌ای ایمیل بفرستد.
    """
    raw = os.getenv("EMAIL_ALLOWED_DOMAINS", "")
    return [d.strip().lower().lstrip("@") for d in raw.split(",") if d.strip()]


def validate_email_address(address: str, *, field: str = "نشانی") -> str:
    """نشانی را اعتبارسنجی و نرمال می‌کند، یا GuardError می‌دهد."""
    if not isinstance(address, str) or not address.strip():
        raise GuardError(f"{field} ایمیل خالی است.")

    cleaned = address.strip()

    if _HEADER_INJECTION_RE.search(cleaned):
        raise GuardError(f"{field} ایمیل شامل کاراکتر خط جدید است و پذیرفته نمی‌شود.")

    if not _EMAIL_RE.match(cleaned):
        raise GuardError(f"{field} ایمیل معتبر نیست: {cleaned!r}")

    domains = allowed_email_domains()
    if domains:
        domain = cleaned.rsplit("@", 1)[1].lower()
        if domain not in domains:
            raise GuardError(
                f"ارسال به دامنه‌ی {domain} مجاز نیست. "
                f"دامنه‌های مجاز: {', '.join(domains)}"
            )

    return cleaned


def validate_email_content(subject: str, message: str) -> tuple[str, str]:
    """موضوع و متن را اعتبارسنجی می‌کند."""
    if not subject or not subject.strip():
        raise GuardError("موضوع ایمیل خالی است.")
    if not message or not message.strip():
        raise GuardError("متن ایمیل خالی است.")

    if _HEADER_INJECTION_RE.search(subject):
        raise GuardError("موضوع ایمیل نباید شامل خط جدید باشد (خطر تزریق سرتیتر).")

    if len(subject) > MAX_SUBJECT_LENGTH:
        raise GuardError(
            f"موضوع ایمیل طولانی‌تر از حد مجاز است "
            f"({len(subject)} از {MAX_SUBJECT_LENGTH} کاراکتر)."
        )
    if len(message) > MAX_MESSAGE_LENGTH:
        raise GuardError(
            f"متن ایمیل طولانی‌تر از حد مجاز است "
            f"({len(message)} از {MAX_MESSAGE_LENGTH} کاراکتر)."
        )

    return subject.strip(), message


# ---------------------------------------------------------------------------
# سقف استفاده در هر نشست
# ---------------------------------------------------------------------------


def check_and_count(action: str, session_id: str) -> None:
    """
    یک بار استفاده از ابزار را می‌شمارد و اگر از سقف گذشت GuardError می‌دهد.

    هدف، مهار یک مدل گمراه‌شده یا یک کاربر سوءاستفاده‌گر است که ابزار را پشت سر
    هم صدا می‌زند — نه محدود کردن استفاده‌ی عادی.
    """
    limits = {
        "send_email": _limit("EMAIL_MAX_PER_SESSION", DEFAULT_EMAIL_MAX_PER_SESSION),
        "unblock_user": _limit(
            "UNBLOCK_MAX_PER_SESSION", DEFAULT_UNBLOCK_MAX_PER_SESSION
        ),
        "send_sms": _limit("SMS_MAX_PER_SESSION", DEFAULT_SMS_MAX_PER_SESSION),
    }
    if action not in limits:
        raise GuardError(f"عمل ناشناخته برای شمارش: {action!r}")

    limit = limits[action]
    key = (action, session_id)

    if _usage[key] >= limit:
        raise GuardError(
            f"سقف استفاده از {action} در این گفت‌وگو پر شده است "
            f"({limit} بار). برای ادامه با پشتیبانی انسانی تماس بگیرید."
        )

    _usage[key] += 1


def reset_usage(session_id: str | None = None) -> None:
    """شمارنده‌ها را پاک می‌کند. برای تست و پایان نشست."""
    if session_id is None:
        _usage.clear()
        return
    for key in [k for k in _usage if k[1] == session_id]:
        del _usage[key]


# ---------------------------------------------------------------------------
# نام کاربری
# ---------------------------------------------------------------------------


def normalize_username(username: str) -> str:
    """
    نام کاربری را به شکلی که در blockusers.txt ذخیره می‌شود درمی‌آورد.

    مدل ممکن است `\\دامنه\\کاربر`، `دامنه\\کاربر` یا `/دامنه/کاربر` بفرستد؛
    فایل فقط خودِ نام کاربری را نگه می‌دارد.
    """
    if not isinstance(username, str) or not username.strip():
        raise GuardError("نام کاربری خالی است.")

    cleaned = username.strip().replace("/", "\\")
    return cleaned.rsplit("\\", 1)[-1].strip().lower()


# ---------------------------------------------------------------------------
# شماره‌ی موبایل
# ---------------------------------------------------------------------------


def normalize_mobile(raw: str) -> str:
    """
    شماره‌ی موبایل ایران را به قالب `09xxxxxxxxx` درمی‌آورد.

    کاربر شماره را **شفاهی** می‌گوید و مدل آن را می‌نویسد، پس ورودی می‌تواند
    ارقام فارسی داشته باشد، با `+98` یا `0098` یا `98` شروع شود، یا بین ارقام
    فاصله و خط تیره داشته باشد. همه‌ی این‌ها پذیرفته می‌شوند.

    🔴 چیزی که پذیرفته **نمی‌شود** هر شکل مبهم دیگری است. یک شماره‌ی اشتباه
    یعنی پیامک به یک غریبه، و آن را نمی‌شود پس گرفت.
    """
    if not isinstance(raw, str):
        raise GuardError("شماره‌ی موبایل باید متن باشد.")

    value = raw.translate(_PERSIAN_DIGITS)
    # فاصله، خط تیره، پرانتز و نقطه — چیزهایی که مدل برای خوانایی می‌گذارد
    value = re.sub(r"[\s\-()._]", "", value)

    if not value:
        raise GuardError("شماره‌ی موبایل خالی است.")

    if value.startswith("+98"):
        value = "0" + value[3:]
    elif value.startswith("0098"):
        value = "0" + value[4:]
    elif value.startswith("98") and len(value) == 12:
        value = "0" + value[2:]
    elif value.startswith("9") and len(value) == 10:
        value = "0" + value

    if not _MOBILE_RE.match(value):
        raise GuardError(
            f"شماره‌ی موبایل معتبر نیست: {raw!r}. قالب درست ۰۹ و نه رقم دیگر است."
        )

    return value


def validate_sms_text(message: str) -> str:
    """متن پیامک را بررسی می‌کند و شکل تمیزشده‌اش را برمی‌گرداند."""
    if not isinstance(message, str) or not message.strip():
        raise GuardError("متن پیامک خالی است.")

    text = message.strip()
    if len(text) > MAX_SMS_LENGTH:
        raise GuardError(
            f"متن پیامک نباید از {MAX_SMS_LENGTH} کاراکتر بیشتر باشد "
            f"(الان {len(text)} کاراکتر است)."
        )
    return text
