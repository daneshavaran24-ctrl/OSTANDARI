"""
تست‌های ابزار پیامک و مهارهای ورودی‌اش.

مهم‌ترین ادعا: **بدون تأیید صریح کاربر، هیچ پیامکی فرستاده نمی‌شود.** پیامکِ
رفته را نمی‌شود پس گرفت، پس این تنها مهاری است که واقعاً اهمیت دارد.
"""

import types

import pytest

import guards
import rpc
import sms
import storage
import tools
from guards import GuardError


@pytest.fixture(autouse=True)
def no_room(monkeypatch):
    """شناسه‌ی نشست بدون اتاق LiveKit."""
    monkeypatch.setattr(
        tools,
        "get_job_context",
        lambda: types.SimpleNamespace(room=types.SimpleNamespace(name="اتاق-تست")),
    )
    guards.reset_usage()


@pytest.fixture
def configured(monkeypatch):
    """پیکربندی کامل پیامک، بدون پایگاه داده."""
    monkeypatch.setattr(storage, "get_secret", lambda *a, **k: "کلید-تست")
    monkeypatch.setattr(storage, "get_setting", lambda *a, **k: "3000123")
    monkeypatch.setattr(storage, "claim_sms", lambda *a, **k: True)
    monkeypatch.setattr(storage, "finish_sms", lambda *a, **k: None)
    monkeypatch.setattr(tools.storage, "get_secret", lambda *a, **k: "کلید-تست")
    monkeypatch.setattr(tools.storage, "get_setting", lambda *a, **k: "3000123")
    monkeypatch.setattr(tools.storage, "claim_sms", lambda *a, **k: True)
    monkeypatch.setattr(tools.storage, "finish_sms", lambda *a, **k: None)


# ---------------------------------------------------------------------------
# شماره‌ی موبایل — کاربر آن را شفاهی می‌گوید
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        "09121234567",
        "۰۹۱۲۱۲۳۴۵۶۷",  # ارقام فارسی
        "٠٩١٢١٢٣٤٥٦٧",  # ارقام عربی
        "0912 123 4567",
        "0912-123-4567",
        "+989121234567",
        "00989121234567",
        "989121234567",
        "9121234567",
    ],
)
def test_every_shape_a_user_might_dictate_is_accepted(raw):
    assert guards.normalize_mobile(raw) == "09121234567"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "0912123456",  # یک رقم کم
        "091212345678",  # یک رقم زیاد
        "02112345678",  # تلفن ثابت، نه موبایل
        "08121234567",  # با ۰۹ شروع نمی‌شود
        "شماره ندارم",
        "0912123456a",
    ],
)
def test_anything_ambiguous_is_refused(raw):
    # یک شماره‌ی اشتباه یعنی پیامک به یک غریبه
    with pytest.raises(GuardError):
        guards.normalize_mobile(raw)


def test_a_non_string_is_refused():
    for value in (None, 9121234567, [], {}):
        with pytest.raises(GuardError):
            guards.normalize_mobile(value)


# ---------------------------------------------------------------------------
# متن پیامک
# ---------------------------------------------------------------------------


def test_empty_text_is_refused():
    for value in ("", "   ", "\n"):
        with pytest.raises(GuardError):
            guards.validate_sms_text(value)


def test_long_text_is_refused():
    # پیامک فارسی هر ۷۰ کاراکتر یک بخش است و هر بخش جدا هزینه دارد
    with pytest.raises(GuardError):
        guards.validate_sms_text("x" * (guards.MAX_SMS_LENGTH + 1))


def test_text_is_trimmed():
    assert guards.validate_sms_text("  سلام  ") == "سلام"


# ---------------------------------------------------------------------------
# 🔴 تأیید کاربر
# ---------------------------------------------------------------------------


async def test_nothing_is_sent_without_confirmation(monkeypatch, configured):
    sent = []

    async def never_called(**kwargs):
        sent.append(kwargs)
        raise AssertionError("بدون تأیید نباید ارسالی انجام شود")

    monkeypatch.setattr(sms, "send_single", never_called)
    monkeypatch.setattr(tools.sms, "send_single", never_called)

    async def refuse(*args, **kwargs):
        return False

    monkeypatch.setattr(rpc, "confirm", refuse)
    monkeypatch.setattr(tools.rpc, "confirm", refuse)

    result = await tools.send_sms(context=None, mobile="09121234567", message="سلام")

    assert sent == []
    assert "تأیید" in result


async def test_the_confirmation_shows_the_number_and_the_text(monkeypatch, configured):
    asked = {}

    async def capture(title, message, **kwargs):
        asked["title"] = title
        asked["message"] = message
        return False

    monkeypatch.setattr(rpc, "confirm", capture)
    monkeypatch.setattr(tools.rpc, "confirm", capture)

    await tools.send_sms(context=None, mobile="۰۹۱۲۱۲۳۴۵۶۷", message="کد شما ۱۲۳۴ است")

    # کاربر باید ببیند به چه شماره‌ای و با چه متنی، وگرنه تأییدش بی‌معنی است
    assert "09121234567" in asked["message"]
    assert "کد شما ۱۲۳۴ است" in asked["message"]


async def test_a_confirmed_send_reaches_the_provider(monkeypatch, configured):
    captured = {}

    async def fake_send(**kwargs):
        captured.update(kwargs)
        return sms.SmsResult(message_id="7", raw={})

    async def accept(*args, **kwargs):
        return True

    monkeypatch.setattr(tools.sms, "send_single", fake_send)
    monkeypatch.setattr(tools.rpc, "confirm", accept)

    async def quiet_notify(*args, **kwargs):
        return True

    monkeypatch.setattr(tools.rpc, "notify", quiet_notify)

    result = await tools.send_sms(context=None, mobile="0912 123 4567", message="سلام")

    assert captured["receptor"] == "09121234567"
    assert captured["line_number"] == "3000123"
    # شناسه‌ی یکتا باید ساخته شده باشد، وگرنه یک retry دو پیامک می‌فرستد
    assert captured["client_reference_id"]
    assert "ارسال شد" in result


# ---------------------------------------------------------------------------
# پیکربندی و خطا
# ---------------------------------------------------------------------------


async def test_without_configuration_nothing_is_attempted(monkeypatch):
    monkeypatch.setattr(tools.storage, "get_secret", lambda *a, **k: "")
    monkeypatch.setattr(tools.storage, "get_setting", lambda *a, **k: "")

    async def never(*args, **kwargs):
        raise AssertionError("نباید تا تأیید هم پیش برود")

    monkeypatch.setattr(tools.rpc, "confirm", never)

    result = await tools.send_sms(context=None, mobile="09121234567", message="سلام")
    assert "پیکربندی" in result


async def test_a_duplicate_reference_stops_the_send(monkeypatch, configured):
    monkeypatch.setattr(tools.storage, "claim_sms", lambda *a, **k: False)

    async def accept(*args, **kwargs):
        return True

    monkeypatch.setattr(tools.rpc, "confirm", accept)

    async def never(**kwargs):
        raise AssertionError("پیامک تکراری نباید فرستاده شود")

    monkeypatch.setattr(tools.sms, "send_single", never)

    result = await tools.send_sms(context=None, mobile="09121234567", message="سلام")
    assert "قبلاً" in result


async def test_a_provider_failure_does_not_leak_its_message(monkeypatch, configured):
    recorded = {}

    async def boom(**kwargs):
        raise sms.SmsError("اعتبار حساب ۱۲۳۴ کافی نیست")

    async def accept(*args, **kwargs):
        return True

    monkeypatch.setattr(tools.sms, "send_single", boom)
    monkeypatch.setattr(tools.rpc, "confirm", accept)
    monkeypatch.setattr(
        tools.storage,
        "finish_sms",
        lambda ref, status, **kwargs: recorded.update(status=status),
    )

    result = await tools.send_sms(context=None, mobile="09121234567", message="سلام")

    # جزئیات حساب سرویس‌دهنده نباید به کاربر برسد
    assert "۱۲۳۴" not in result
    assert "اعتبار" not in result
    assert recorded["status"] == "failed"


async def test_the_tool_is_rate_limited(monkeypatch, configured):
    async def accept(*args, **kwargs):
        return True

    async def fake_send(**kwargs):
        return sms.SmsResult(message_id="1", raw={})

    async def quiet(*args, **kwargs):
        return True

    monkeypatch.setattr(tools.rpc, "confirm", accept)
    monkeypatch.setattr(tools.rpc, "notify", quiet)
    monkeypatch.setattr(tools.sms, "send_single", fake_send)
    monkeypatch.setenv("SMS_MAX_PER_SESSION", "2")

    for _ in range(2):
        assert "ارسال شد" in await tools.send_sms(
            context=None, mobile="09121234567", message="سلام"
        )

    blocked = await tools.send_sms(context=None, mobile="09121234567", message="سلام")
    assert "سقف" in blocked


async def test_a_malformed_key_is_reported_like_any_other_failure(
    monkeypatch, configured
):
    """
    کلید با نویسه‌ی غیر ASCII نباید از ابزار بیرون بزند.

    پیش از نگهبانِ `_headers`، اینجا یک `UnicodeEncodeError` خام بالا می‌آمد و
    `finish_sms` هرگز اجرا نمی‌شد.
    """
    recorded = {}

    monkeypatch.setattr(tools.storage, "get_secret", lambda *a, **k: "کلید-فارسی")
    monkeypatch.setattr(
        tools.storage,
        "finish_sms",
        lambda ref, status, **kwargs: recorded.update(status=status),
    )

    async def accept(*args, **kwargs):
        return True

    monkeypatch.setattr(tools.rpc, "confirm", accept)

    result = await tools.send_sms(context=None, mobile="09121234567", message="سلام")

    assert "ناموفق" in result
    assert recorded["status"] == "failed"
