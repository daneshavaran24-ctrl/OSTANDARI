"""
تست‌های سطح-واحد برای منطق ابزارهای ایجنت.

این تست‌ها عمداً هیچ کلید API و هیچ اتصال شبکه‌ای لازم ندارند، پس در CI هم اجرا
می‌شوند. رفتار گفت‌وگویی ایجنت (لحن، فارسی حرف زدن، ترتیب مراحل) اینجا سنجیده
نمی‌شود؛ آن‌ها در `scenarios.yaml` با `lk agent simulate` پوشش داده می‌شوند.

نمونه‌ی قضاوت‌با‌LLM در انتهای فایل به‌صورت کامنت آمده است.
"""

import types
from pathlib import Path

import pytest
from livekit import rtc

import guards
import rpc
import tools
from rpc import RpcError


class FakeParticipant:
    """
    participant جعلی با مقدار واقعی `kind`.

    نکته‌ی مهم: `kind` باید همان enum عددی protobuf باشد که کتابخانه می‌دهد، نه یک
    رشته‌ی ساختگی. نسخه‌ی قبلی این تست رشته‌ی "ParticipantKind.AGENT" می‌داد و به
    همین دلیل یک فیلتر غلط را سبز نشان می‌داد: کد، `kind` را با endswith("AGENT")
    می‌سنجید که برای مقدار واقعی (عدد ۴) هیچ‌وقت درست نمی‌شد.
    """

    def __init__(self, kind: int) -> None:
        self.kind = kind


class FakeRoom:
    def __init__(self, participants: dict) -> None:
        self.remote_participants = participants


@pytest.fixture
def room(monkeypatch):
    """
    اتاق جعلی به ایجنت تزریق می‌کند.

    نکته: هر دو ماژول `get_job_context` را با `from ... import` گرفته‌اند، پس
    باید خودِ نام داخل همان ماژول‌ها پچ شود، نه `livekit.agents`.
    """

    def _set(participants: dict) -> None:
        context = lambda: types.SimpleNamespace(room=FakeRoom(participants))  # noqa: E731
        monkeypatch.setattr(tools, "get_job_context", context)
        monkeypatch.setattr(rpc, "get_job_context", context)

    return _set


# آواتار Beyond Presence با kind="agent" وارد اتاق می‌شود
AVATAR = FakeParticipant(rtc.ParticipantKind.PARTICIPANT_KIND_AGENT)
HUMAN = FakeParticipant(rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD)


# --------------------------------------------------------------------------
# مسیر فایل کاربران مسدودشده
# --------------------------------------------------------------------------


def test_block_file_points_at_demo_app():
    """
    مسیر پیش‌فرض باید به blockusers.txt اپ دمو برسد.

    این تست نگهبان جابه‌جایی فایل‌ها است: tools.py داخل agent/src/ است، پس باید
    سه سطح بالا برود تا به ریشه‌ی مونوریپو برسد. اگر کسی آن را به parent.parent
    برگرداند، مسیر به agent/demo-app/ می‌رسد و این تست می‌شکند.
    """
    expected = (
        Path(tools.__file__).parents[2] / "demo-app" / "public" / "blockusers.txt"
    )
    assert tools._block_file() == expected
    assert expected.exists(), f"فایل مسدودی در {expected} پیدا نشد"


def test_block_file_can_be_overridden(monkeypatch, tmp_path):
    """BLOCK_USERS_FILE باید مسیر پیش‌فرض را بازنویسی کند (برای استقرار)."""
    custom = tmp_path / "blocked.txt"
    monkeypatch.setenv("BLOCK_USERS_FILE", str(custom))
    assert tools._block_file() == custom


# --------------------------------------------------------------------------
# انتخاب مخاطب اعلان
# --------------------------------------------------------------------------


def test_picks_human_when_human_joined_first(room):
    room({"voice_assistant_user_42": HUMAN, "bey-avatar-abc": AVATAR})
    assert rpc.human_participant_identity() == "voice_assistant_user_42"


def test_picks_human_when_avatar_joined_first(room):
    """
    آواتار Beyond Presence خودش یک participant مستقل است.

    کد اولیه اولین عضو remote_participants را برمی‌داشت و در این ترتیب، اعلان را
    به آواتار می‌فرستاد نه به کاربر.
    """
    room({"bey-avatar-abc": AVATAR, "voice_assistant_user_42": HUMAN})
    assert rpc.human_participant_identity() == "voice_assistant_user_42"


def test_avatar_kind_is_not_detectable_as_a_string(room):
    """
    نگهبان رگرسیون: مقدار واقعی `kind` یک عدد است، نه رشته.

    اگر کسی فیلتر را به مقایسه‌ی رشته‌ای برگرداند (مثلاً
    str(kind).endswith("AGENT")) این تست می‌شکند، چون str(4) برابر "4" است و
    آواتار دیگر کنار گذاشته نمی‌شود.
    """
    assert str(AVATAR.kind).upper().endswith("AGENT") is False
    room({"bey-avatar-abc": AVATAR, "voice_assistant_user_42": HUMAN})
    assert rpc.human_participant_identity() == "voice_assistant_user_42"


def test_raises_rpc_error_when_only_avatar_present(room):
    room({"bey-avatar-abc": AVATAR})
    with pytest.raises(RpcError):
        rpc.human_participant_identity()


def test_raises_rpc_error_on_empty_room(room):
    """اتاق خالی باید RpcError بدهد، نه StopIteration."""
    room({})
    with pytest.raises(RpcError):
        rpc.human_participant_identity()


# --------------------------------------------------------------------------
# ابزار unblock_user
# --------------------------------------------------------------------------


async def test_unblock_user_reports_missing_file(monkeypatch, tmp_path):
    """فایل ناموجود باید پیام تمیز برگرداند، نه استثنای مدیریت‌نشده."""
    monkeypatch.setenv("BLOCK_USERS_FILE", str(tmp_path / "nope.txt"))
    result = await tools.unblock_user(context=None, username="maxman123")
    assert "blockusers.txt" in result


async def test_unblock_user_clears_file_then_notifies(monkeypatch, tmp_path, room):
    """مسدودیت باید برداشته شود و اعلان به کاربر انسانی برود."""
    block_file = tmp_path / "blockusers.txt"
    block_file.write_text("maxman123\n", encoding="utf-8")
    monkeypatch.setenv("BLOCK_USERS_FILE", str(block_file))

    sent = []

    async def fake_notify(message, kind="success", **kwargs):
        sent.append((message, kind))
        return True

    monkeypatch.setattr(rpc, "notify", fake_notify)
    room({"voice_assistant_user_42": HUMAN})

    result = await tools.unblock_user(context=None, username="maxman123")

    assert block_file.read_text() == "", "فایل مسدودی پاک نشد"
    assert len(sent) == 1
    message, kind = sent[0]
    assert "maxman123" in message
    assert kind == "success"
    assert "maxman123" in result


async def test_unblock_user_removes_only_the_named_user(monkeypatch, tmp_path, room):
    """
    مهم‌ترین تست این فایل.

    نسخه‌ی اولیه با write_text("") کل فایل را خالی می‌کرد، یعنی یک درخواست رفع
    مسدودیت برای یک نفر، همه‌ی کاربران مسدود را آزاد می‌کرد. تست قبلی این را
    نمی‌گرفت چون فایل آزمایشی فقط یک کاربر داشت.
    """
    block_file = tmp_path / "blockusers.txt"
    block_file.write_text("alice\nmaxman123\nbob\n", encoding="utf-8")
    monkeypatch.setenv("BLOCK_USERS_FILE", str(block_file))

    async def fake_notify(message, kind="success", **kwargs):
        return True

    monkeypatch.setattr(rpc, "notify", fake_notify)
    room({"voice_assistant_user_42": HUMAN})

    await tools.unblock_user(context=None, username="\\vienna\\maxman123")

    remaining = block_file.read_text().split()
    assert remaining == ["alice", "bob"], (
        f"فقط maxman123 باید حذف می‌شد، ولی فایل شد: {remaining}"
    )


async def test_unblock_user_reports_when_the_user_was_not_blocked(
    monkeypatch, tmp_path, room
):
    """
    اگر کاربر اصلاً مسدود نبود، نباید ادعای موفقیت کند — وگرنه مدل به کاربر
    می‌گوید مشکل حل شد در حالی که علت ورود نکردنش چیز دیگری است.
    """
    block_file = tmp_path / "blockusers.txt"
    block_file.write_text("alice\n", encoding="utf-8")
    monkeypatch.setenv("BLOCK_USERS_FILE", str(block_file))
    room({"voice_assistant_user_42": HUMAN})

    result = await tools.unblock_user(context=None, username="maxman123")

    assert "نیست" in result
    assert block_file.read_text() == "alice\n", "فایل نباید دست می‌خورد"


async def test_unblock_user_is_rate_limited(monkeypatch, tmp_path, room):
    """یک مدل گمراه‌شده نباید بتواند بی‌نهایت بار ابزار را صدا بزند."""
    block_file = tmp_path / "blockusers.txt"
    block_file.write_text("alice\n", encoding="utf-8")
    monkeypatch.setenv("BLOCK_USERS_FILE", str(block_file))
    monkeypatch.setenv("UNBLOCK_MAX_PER_SESSION", "2")
    room({"voice_assistant_user_42": HUMAN})
    guards.reset_usage()

    for _ in range(2):
        await tools.unblock_user(context=None, username="alice")
    result = await tools.unblock_user(context=None, username="alice")

    assert "سقف" in result


async def test_send_email_rejects_an_invalid_address(monkeypatch):
    """اعتبارسنجی باید قبل از رسیدن به SMTP جلویش را بگیرد."""
    monkeypatch.setenv("GMAIL_USER", "a@b.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "x")
    guards.reset_usage()

    result = await tools.send_email(
        context=None, to_email="not-an-email", subject="تست", message="متن"
    )
    assert "معتبر نیست" in result


async def test_send_email_rejects_header_injection(monkeypatch):
    monkeypatch.setenv("GMAIL_USER", "a@b.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "x")
    guards.reset_usage()

    result = await tools.send_email(
        context=None,
        to_email="victim@example.com",
        subject="سلام\nBcc: attacker@evil.com",
        message="متن",
    )
    assert "خط جدید" in result


async def test_unblock_user_still_succeeds_when_notification_fails(
    monkeypatch, tmp_path
):
    """
    اگر اعلان بصری نرسد، مسدودیت واقعاً برداشته شده و ایجنت نباید به مدل بگوید
    کار انجام نشد — وگرنه دوباره ابزار را صدا می‌زند.
    """
    block_file = tmp_path / "blockusers.txt"
    block_file.write_text("maxman123\n", encoding="utf-8")
    monkeypatch.setenv("BLOCK_USERS_FILE", str(block_file))

    async def failed_notify(message, kind="success", **kwargs):
        return False

    monkeypatch.setattr(rpc, "notify", failed_notify)

    result = await tools.unblock_user(context=None, username="maxman123")

    assert block_file.read_text() == ""
    assert "برداشته شد" in result


# --------------------------------------------------------------------------
# ابزار send_email
# --------------------------------------------------------------------------


async def test_send_email_requires_credentials(monkeypatch):
    """بدون اطلاعات ورود Gmail باید پیام روشن بدهد، نه تلاش برای اتصال SMTP."""
    monkeypatch.delenv("GMAIL_USER", raising=False)
    monkeypatch.delenv("GMAIL_APP_PASSWORD", raising=False)

    result = await tools.send_email(
        context=None,
        to_email="user@example.com",
        subject="تست",
        message="متن",
    )
    assert "Gmail" in result


# --------------------------------------------------------------------------
# نمونه‌ی قضاوت‌با‌LLM از قالب رسمی لایوکیت.
#
# این تست به کلید API و شبکه نیاز دارد، پس در CI اجرا نمی‌شود. برای استفاده،
# کامنت را بردارید و `uv run pytest` را با کلیدهای معتبر اجرا کنید.
# مستندات: https://docs.livekit.io/agents/start/testing/
#
# import pytest
# from livekit.agents import AgentSession, inference
#
# from agent import Assistant
#
#
# @pytest.mark.asyncio
# async def test_greets_in_persian() -> None:
#     """ایجنت باید گفت‌وگو را به فارسی شروع کند."""
#     async with (
#         inference.LLM(model="openai/gpt-4.1-mini") as judge_llm,
#         AgentSession() as session,
#     ):
#         await session.start(Assistant())
#         result = await session.run(user_input="سلام")
#         await (
#             result.expect.next_event()
#             .is_message(role="assistant")
#             .judge(
#                 judge_llm,
#                 intent=(
#                     "به فارسی سلام می‌کند، خودش را به‌عنوان دستیار پشتیبانی "
#                     "معرفی می‌کند و پیشنهاد کمک می‌دهد. کوتاه و بدون فهرست."
#                 ),
#             )
#         )
#         result.expect.no_more_events()
# --------------------------------------------------------------------------
