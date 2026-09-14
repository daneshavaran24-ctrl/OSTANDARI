"""
تنها نقطه‌ی دسترسی ایجنت به پایگاه داده‌ی مشترک.

پنل ادمین (Next.js) می‌نویسد و ایجنت می‌خواند. یک قاعده‌ی مهم در سراسر این
ماژول برقرار است:

    **نبود پایگاه داده نباید ایجنت را بشکند.**

اگر فایل دیتابیس وجود نداشته باشد یا خالی باشد، هر تابع به متغیر محیطی یا
پیش‌فرض برمی‌گردد — یعنی همان رفتاری که پیش از افزوده شدن پنل داشت. این تنها
چیزی است که اجازه می‌دهد راه‌اندازی‌های موجود دست‌نخورده کار کنند.
"""

import logging
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from crypto import DecryptionError, EncryptionKeyError, decrypt_secret

logger = logging.getLogger("agent")

# نسخه‌ای که این کد انتظارش را دارد. اگر دیتابیس جلوتر باشد یعنی پنل ارتقا
# یافته ولی ایجنت نه — به‌جای خرابی خاموش، هشدار روشن می‌دهیم.
EXPECTED_SCHEMA_VERSION = 2

DEFAULT_DB_PATH = Path(__file__).parents[2] / "data" / "ostandari.db"


def database_path() -> Path:
    return Path(os.getenv("DATABASE_PATH", str(DEFAULT_DB_PATH)))


@contextmanager
def _connect() -> Iterator[sqlite3.Connection | None]:
    """
    اتصال فقط اگر فایل واقعاً وجود داشته باشد.

    عمداً دیتابیس را نمی‌سازد: ساختن اسکیما کار اسکریپت مهاجرت است، و یک فایل
    خالیِ ساخته‌شده به‌دست ایجنت فقط باعث سردرگمی می‌شود.
    """
    path = database_path()
    if not path.exists():
        yield None
        return

    conn = sqlite3.connect(path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    try:
        # WAL لازم است چون پنل ادمین هم‌زمان می‌نویسد.
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        yield conn
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        logger.error("خطای پایگاه داده: %s", e)
        raise
    finally:
        conn.close()


def is_available() -> bool:
    """آیا پایگاه داده در دسترس و با نسخه‌ی مورد انتظار است؟"""
    try:
        with _connect() as conn:
            if conn is None:
                return False
            row = conn.execute("SELECT version FROM schema_version").fetchone()
    except sqlite3.Error:
        return False

    if row is None:
        return False

    if row["version"] > EXPECTED_SCHEMA_VERSION:
        logger.warning(
            "نسخه‌ی اسکیمای پایگاه داده (%s) جلوتر از چیزی است که این ایجنت "
            "می‌شناسد (%s). پنل ادمین ارتقا یافته ولی ایجنت نه.",
            row["version"],
            EXPECTED_SCHEMA_VERSION,
        )
    return True


# ---------------------------------------------------------------------------
# تنظیمات
# ---------------------------------------------------------------------------


def get_setting(key: str, env_var: str | None = None, default: str = "") -> str:
    """
    یک تنظیم را می‌خواند، به ترتیب: پایگاه داده → متغیر محیطی → پیش‌فرض.

    این ترتیب عمدی است. پنل ادمین بالاترین اولویت را دارد، ولی اگر مقداری در
    آن تنظیم نشده باشد، همان `.env.local` امروز کار می‌کند.
    """
    try:
        with _connect() as conn:
            if conn is not None:
                row = conn.execute(
                    "SELECT value FROM settings WHERE key = ?", (key,)
                ).fetchone()
                if row is not None and str(row["value"]).strip():
                    return str(row["value"]).strip()
    except sqlite3.Error:
        logger.warning("خواندن تنظیم %s از پایگاه داده ناموفق بود", key)

    if env_var:
        value = os.getenv(env_var, "").strip()
        if value:
            return value

    return default


def get_int_setting(key: str, env_var: str | None = None, *, default: int) -> int:
    raw = get_setting(key, env_var, str(default))
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "مقدار %s عدد نیست: %r — از پیش‌فرض %s استفاده شد", key, raw, default
        )
        return default


# ---------------------------------------------------------------------------
# کلیدهای API
# ---------------------------------------------------------------------------


def get_secret(name: str, env_var: str) -> str:
    """
    یک کلید API را می‌خواند: پایگاه داده (رمزگشایی‌شده) → متغیر محیطی.

    اگر رمزگشایی شکست بخورد، **به متغیر محیطی برمی‌گردیم** و هشدار می‌دهیم.
    یک ENCRYPTION_KEY عوض‌شده نباید کل سرویس را بخواباند وقتی کلید معتبری در
    محیط هست.
    """
    try:
        with _connect() as conn:
            if conn is not None:
                row = conn.execute(
                    "SELECT ciphertext FROM secrets WHERE name = ?", (name,)
                ).fetchone()
                if row is not None:
                    return decrypt_secret(str(row["ciphertext"]))
    except (sqlite3.Error, DecryptionError, EncryptionKeyError) as e:
        logger.warning(
            "خواندن کلید %s از پایگاه داده ناموفق بود (%s) — به متغیر محیطی برمی‌گردیم",
            name,
            e,
        )

    return os.getenv(env_var, "").strip()


# ---------------------------------------------------------------------------
# محدودیت‌های موضوعی
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Restriction:
    topic: str
    response: str


def get_restrictions() -> list[Restriction]:
    """محدودیت‌های فعال، به ترتیب نمایش در پنل."""
    try:
        with _connect() as conn:
            if conn is None:
                return []
            rows = conn.execute(
                "SELECT topic, response FROM restrictions "
                "WHERE enabled = 1 ORDER BY position, id"
            ).fetchall()
    except sqlite3.Error:
        logger.warning("خواندن محدودیت‌ها ناموفق بود — بدون محدودیت ادامه می‌دهیم")
        return []

    return [Restriction(str(r["topic"]), str(r["response"])) for r in rows]


# ---------------------------------------------------------------------------
# رونوشت گفت‌وگو
# ---------------------------------------------------------------------------


def transcripts_enabled() -> bool:
    return get_setting("record_transcripts", default="1") not in ("0", "false", "off")


def start_conversation(room_name: str) -> int | None:
    """ردیف گفت‌وگو را می‌سازد و شناسه‌اش را برمی‌گرداند، یا None اگر ثبت خاموش است."""
    if not transcripts_enabled():
        return None

    try:
        with _connect() as conn:
            if conn is None:
                return None
            cur = conn.execute(
                "INSERT INTO conversations (room_name) VALUES (?) "
                "ON CONFLICT (room_name) DO UPDATE SET room_name = excluded.room_name "
                "RETURNING id",
                (room_name,),
            )
            row = cur.fetchone()
            return int(row["id"]) if row else None
    except sqlite3.Error as e:
        logger.warning("ساخت ردیف گفت‌وگو ناموفق بود: %s", e)
        return None


def save_messages(conversation_id: int, messages: list[tuple[str, str]]) -> None:
    """
    پیام‌ها را یک‌جا می‌نویسد.

    یک‌جا نوشتن عمدی است: نوشتن هر جمله روی دیسک، وسط یک گفت‌وگوی صوتی تأخیر
    اضافه می‌کند.
    """
    if not messages:
        return

    try:
        with _connect() as conn:
            if conn is None:
                return
            conn.executemany(
                "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
                [(conversation_id, role, content) for role, content in messages],
            )
    except sqlite3.Error as e:
        logger.warning("ذخیره‌ی رونوشت ناموفق بود: %s", e)


def end_conversation(conversation_id: int, duration_seconds: int) -> None:
    try:
        with _connect() as conn:
            if conn is None:
                return
            conn.execute(
                "UPDATE conversations SET ended_at = datetime('now'), "
                "duration_seconds = ? WHERE id = ?",
                (duration_seconds, conversation_id),
            )
    except sqlite3.Error as e:
        logger.warning("بستن ردیف گفت‌وگو ناموفق بود: %s", e)


def retention_days() -> int:
    """مدت نگه‌داری رونوشت‌ها به روز. صفر یا کمتر یعنی پاک‌سازی خودکار خاموش است."""
    raw = get_setting("transcript_retention_days", default="30")
    try:
        return int(raw)
    except (TypeError, ValueError):
        logger.warning("مقدار نامعتبر برای transcript_retention_days: %r", raw)
        return 30


def purge_old_conversations() -> int:
    """
    گفت‌وگوهای قدیمی‌تر از مدت نگه‌داری را پاک می‌کند و تعدادشان را برمی‌گرداند.

    رونوشت شامل گفته‌های واقعی کاربر است، یعنی داده‌ی شخصی. نگه داشتن نامحدودش
    یک انتخاب نیست، پس این پاک‌سازی در پایان هر نشست اجرا می‌شود — همان‌جایی که
    به‌هرحال به دیتابیس وصل هستیم و کاربر دیگر منتظر پاسخ نیست.

    پیام‌ها با ON DELETE CASCADE همراه گفت‌وگو پاک می‌شوند.
    """
    days = retention_days()
    if days <= 0:
        return 0

    try:
        with _connect() as conn:
            if conn is None:
                return 0
            cur = conn.execute(
                "DELETE FROM conversations WHERE started_at < datetime('now', ?)",
                (f"-{days} days",),
            )
            removed = cur.rowcount or 0
    except sqlite3.Error as e:
        logger.warning("پاک‌سازی رونوشت‌های قدیمی ناموفق بود: %s", e)
        return 0

    if removed:
        logger.info("%d گفت‌وگوی قدیمی‌تر از %d روز پاک شد", removed, days)
    return removed


# ---------------------------------------------------------------------------
# رخدادهای RPC
# ---------------------------------------------------------------------------


def record_rpc_event(
    conversation_id: int | None,
    action_id: str,
    method: str,
    status: str,
    duration_ms: int | None,
    error: str | None,
) -> None:
    """
    یک فراخوانی RPC را ثبت می‌کند.

    مثل بقیه‌ی این ماژول، شکست ثبت هرگز نباید گفت‌وگو را بشکند: اگر پایگاه داده
    نباشد یا قفل باشد، فقط هشدار لاگ می‌شود. متن خطا تا ۵۰۰ کاراکتر بریده
    می‌شود تا یک استثنای طولانی جدول را پر نکند.
    """
    try:
        with _connect() as conn:
            if conn is None:
                return
            conn.execute(
                "INSERT INTO rpc_events "
                "(conversation_id, action_id, method, status, duration_ms, error) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    conversation_id,
                    action_id,
                    method,
                    status,
                    duration_ms,
                    error[:500] if error else None,
                ),
            )
    except sqlite3.Error as e:
        logger.warning("ثبت رخداد RPC ناموفق بود: %s", e)
