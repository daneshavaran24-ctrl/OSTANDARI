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

import tools
from tools import ToolError


class FakeParticipant:
    def __init__(self, kind: str) -> None:
        self.kind = kind


class FakeRoom:
    def __init__(self, participants: dict) -> None:
        self.remote_participants = participants


@pytest.fixture
def room(monkeypatch):
    """
    اتاق جعلی به ایجنت تزریق می‌کند.

    نکته: `tools` تابع `get_job_context` را با `from ... import` گرفته، پس باید
    خودِ نام داخل ماژول `tools` پچ شود، نه `livekit.agents`.
    """

    def _set(participants: dict) -> None:
        monkeypatch.setattr(
            tools,
            "get_job_context",
            lambda: types.SimpleNamespace(room=FakeRoom(participants)),
        )

    return _set


AVATAR = FakeParticipant("ParticipantKind.AGENT")
HUMAN = FakeParticipant("ParticipantKind.STANDARD")


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
    assert tools._human_participant_identity() == "voice_assistant_user_42"


def test_picks_human_when_avatar_joined_first(room):
    """
    آواتار Beyond Presence خودش یک participant مستقل است.

    کد اولیه اولین عضو remote_participants را برمی‌داشت و در این ترتیب، اعلان را
    به آواتار می‌فرستاد نه به کاربر.
    """
    room({"bey-avatar-abc": AVATAR, "voice_assistant_user_42": HUMAN})
    assert tools._human_participant_identity() == "voice_assistant_user_42"


def test_raises_tool_error_when_only_avatar_present(room):
    room({"bey-avatar-abc": AVATAR})
    with pytest.raises(ToolError):
        tools._human_participant_identity()


def test_raises_tool_error_on_empty_room(room):
    """اتاق خالی باید ToolError بدهد، نه StopIteration."""
    room({})
    with pytest.raises(ToolError):
        tools._human_participant_identity()


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

    sent = {}

    async def fake_notify(payload):
        sent.update(payload)
        return "Notification shown"

    monkeypatch.setattr(tools, "_notify_client", fake_notify)
    room({"voice_assistant_user_42": HUMAN})

    result = await tools.unblock_user(context=None, username="maxman123")

    assert block_file.read_text() == "", "فایل مسدودی پاک نشد"
    assert sent == {"type": "unblock_user", "username": "maxman123"}
    assert "maxman123" in result


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

    async def boom(payload):
        raise RuntimeError("rpc timeout")

    monkeypatch.setattr(tools, "_notify_client", boom)

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
# from livekit.agents import AgentSession
# from livekit.plugins import openai
#
# from agent import Assistant
#
#
# @pytest.mark.asyncio
# async def test_greets_in_persian() -> None:
#     """ایجنت باید گفت‌وگو را به فارسی شروع کند."""
#     async with (
#         openai.LLM(model="gpt-4.1-mini") as judge_llm,
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
