"""
تست‌های لایه‌ی دسترسی به پایگاه داده.

مهم‌ترین چیزی که اینجا سنجیده می‌شود **سازگاری عقب‌رو** است: نبود پایگاه داده
نباید ایجنت را بشکند. راه‌اندازی‌های موجود فقط .env.local دارند و باید
دست‌نخورده کار کنند.
"""

import base64
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

import crypto
import storage

SCHEMA = Path(__file__).parents[2] / "db" / "schema.sql"
VALID_KEY = base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()


@pytest.fixture
def db(tmp_path, monkeypatch):
    """یک پایگاه داده‌ی تازه با اسکیمای واقعی پروژه."""
    path = tmp_path / "test.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.execute("INSERT INTO schema_version (version) VALUES (1)")
    conn.commit()
    conn.close()
    monkeypatch.setenv("DATABASE_PATH", str(path))
    monkeypatch.setenv("ENCRYPTION_KEY", VALID_KEY)
    return path


@pytest.fixture
def no_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "missing.db"))


def write(path: Path, sql: str, *params: object) -> None:
    conn = sqlite3.connect(path)
    conn.execute(sql, params)
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# سازگاری عقب‌رو — مهم‌ترین بخش
# ---------------------------------------------------------------------------


def test_everything_works_without_a_database(no_db, monkeypatch):
    """
    راه‌اندازی امروزی فقط .env.local دارد. اگر افزودن پنل آن را بشکند، هر
    نصب موجود از کار می‌افتد.
    """
    monkeypatch.setenv("OPENAI_VOICE", "cedar")

    assert storage.is_available() is False
    assert storage.get_setting("openai_voice", "OPENAI_VOICE", "coral") == "cedar"
    assert storage.get_int_setting("session_duration_seconds", default=30) == 30
    assert storage.get_restrictions() == []
    assert storage.start_conversation("room-1") is None
    # نباید استثنا بدهند
    storage.save_messages(1, [("user", "سلام")])
    storage.end_conversation(1, 10)


def test_available_when_schema_present(db):
    assert storage.is_available() is True


def test_not_available_when_schema_version_missing(tmp_path, monkeypatch):
    """فایلی که جدول‌ها را دارد ولی نسخه ندارد، آماده حساب نمی‌شود."""
    path = tmp_path / "half.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.commit()
    conn.close()
    monkeypatch.setenv("DATABASE_PATH", str(path))
    assert storage.is_available() is False


# ---------------------------------------------------------------------------
# ترتیب اولویت تنظیمات
# ---------------------------------------------------------------------------


def test_database_wins_over_environment(db, monkeypatch):
    monkeypatch.setenv("OPENAI_VOICE", "از-محیط")
    write(
        db,
        "INSERT INTO settings (key, value) VALUES (?, ?)",
        "openai_voice",
        "از-دیتابیس",
    )
    assert storage.get_setting("openai_voice", "OPENAI_VOICE", "پیش‌فرض") == "از-دیتابیس"


def test_environment_used_when_database_has_no_value(db, monkeypatch):
    monkeypatch.setenv("OPENAI_VOICE", "از-محیط")
    assert storage.get_setting("openai_voice", "OPENAI_VOICE", "پیش‌فرض") == "از-محیط"


def test_empty_database_value_falls_through_to_environment(db, monkeypatch):
    """
    ردیفی با مقدار خالی نباید متغیر محیطی را بی‌اثر کند — وگرنه پاک کردن یک
    فیلد در پنل، تنظیم را به رشته‌ی خالی می‌برد نه به پیش‌فرض.
    """
    monkeypatch.setenv("OPENAI_VOICE", "از-محیط")
    write(db, "INSERT INTO settings (key, value) VALUES (?, ?)", "openai_voice", "   ")
    assert storage.get_setting("openai_voice", "OPENAI_VOICE", "پیش‌فرض") == "از-محیط"


def test_default_used_when_neither_is_set(db):
    assert storage.get_setting("openai_voice", "OPENAI_VOICE", "پیش‌فرض") == "پیش‌فرض"


def test_non_numeric_setting_falls_back_to_default(db):
    write(
        db,
        "INSERT INTO settings (key, value) VALUES (?, ?)",
        "session_duration_seconds",
        "سی",
    )
    assert storage.get_int_setting("session_duration_seconds", default=30) == 30


# ---------------------------------------------------------------------------
# کلیدهای API
# ---------------------------------------------------------------------------


def test_secret_is_decrypted_from_the_database(db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "از-محیط")
    write(
        db,
        "INSERT INTO secrets (name, ciphertext, last4) VALUES (?, ?, ?)",
        "openai_api_key",
        crypto.encrypt_secret("sk-از-دیتابیس"),
        "باس",
    )
    assert storage.get_secret("openai_api_key", "OPENAI_API_KEY") == "sk-از-دیتابیس"


def test_secret_falls_back_to_environment(db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-از-محیط")
    assert storage.get_secret("openai_api_key", "OPENAI_API_KEY") == "sk-از-محیط"


def test_undecryptable_secret_falls_back_instead_of_crashing(db, monkeypatch):
    """
    اگر ENCRYPTION_KEY عوض شده باشد، سرویس نباید بخوابد وقتی کلید معتبری در
    محیط هست. خرابی کامل به‌خاطر یک کلید رمز عوض‌شده، خرابی بدتری است.
    """
    monkeypatch.setenv("OPENAI_API_KEY", "sk-از-محیط")
    write(
        db,
        "INSERT INTO secrets (name, ciphertext, last4) VALUES (?, ?, ?)",
        "openai_api_key",
        "این-یک-رمز-معتبر-نیست",
        "ست",
    )
    assert storage.get_secret("openai_api_key", "OPENAI_API_KEY") == "sk-از-محیط"


# ---------------------------------------------------------------------------
# محدودیت‌ها
# ---------------------------------------------------------------------------


def test_only_enabled_restrictions_are_returned(db):
    write(
        db,
        "INSERT INTO restrictions (topic, response, enabled, position) VALUES (?,?,?,?)",
        "سیاسی",
        "نمی‌توانم.",
        1,
        1,
    )
    write(
        db,
        "INSERT INTO restrictions (topic, response, enabled, position) VALUES (?,?,?,?)",
        "دینی",
        "در حوزه‌ی من نیست.",
        0,
        2,
    )

    topics = [r.topic for r in storage.get_restrictions()]
    assert topics == ["سیاسی"], "محدودیت غیرفعال نباید به پرامپت برود"


def test_restrictions_keep_panel_order(db):
    write(
        db,
        "INSERT INTO restrictions (topic, response, position) VALUES (?,?,?)",
        "دوم",
        "ب",
        2,
    )
    write(
        db,
        "INSERT INTO restrictions (topic, response, position) VALUES (?,?,?)",
        "اول",
        "الف",
        1,
    )
    assert [r.topic for r in storage.get_restrictions()] == ["اول", "دوم"]


# ---------------------------------------------------------------------------
# رونوشت
# ---------------------------------------------------------------------------


def test_transcript_round_trip(db):
    cid = storage.start_conversation("room-abc")
    assert cid is not None

    storage.save_messages(cid, [("user", "سلام"), ("assistant", "بفرمایید")])
    storage.end_conversation(cid, 27)

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id",
        (cid,),
    ).fetchall()
    convo = conn.execute("SELECT * FROM conversations WHERE id = ?", (cid,)).fetchone()
    conn.close()

    assert [(r["role"], r["content"]) for r in rows] == [
        ("user", "سلام"),
        ("assistant", "بفرمایید"),
    ]
    assert convo["duration_seconds"] == 27
    assert convo["ended_at"] is not None


def test_transcript_can_be_switched_off(db):
    write(
        db, "INSERT INTO settings (key, value) VALUES (?, ?)", "record_transcripts", "0"
    )
    assert storage.transcripts_enabled() is False
    assert storage.start_conversation("room-x") is None


def test_saving_empty_transcript_is_a_no_op(db):
    cid = storage.start_conversation("room-empty")
    assert cid is not None
    storage.save_messages(cid, [])  # نباید استثنا بدهد


# ---------------------------------------------------------------------------
# اسکریپت مهاجرت
# ---------------------------------------------------------------------------


def test_migration_script_is_idempotent(tmp_path):
    """
    اجرای دوباره‌ی مهاجرت نباید داده را دو برابر کند یا خطا بدهد.

    PATH واقعی محیط استفاده می‌شود، نه یک PATH ساختگی: روی سیستم‌هایی که چند
    نسخه‌ی Node نصب است، یک PATH دست‌ساز ممکن است نسخه‌ی قدیمی را پیدا کند و
    تست به‌جای منطق مهاجرت، انتخاب نسخه را بسنجد.
    """
    root = Path(__file__).parents[2]
    target = tmp_path / "migrated.db"
    env = {**os.environ, "DATABASE_PATH": str(target)}

    for _ in range(2):
        result = subprocess.run(
            ["node", str(root / "db" / "migrate.mjs")],
            capture_output=True,
            text=True,
            env=env,
            cwd=root,
        )
        assert result.returncode == 0, result.stderr

    conn = sqlite3.connect(target)
    count = conn.execute("SELECT COUNT(*) FROM restrictions").fetchone()[0]
    version = conn.execute("SELECT version FROM schema_version").fetchone()[0]
    conn.close()

    assert count == 2, f"محدودیت‌های نمونه نباید تکرار شوند، ولی {count} تا هست"
    assert version == 1


if sys.platform == "win32":  # pragma: no cover
    pytest.skip("اسکریپت مهاجرت روی ویندوز آزموده نشده", allow_module_level=True)
