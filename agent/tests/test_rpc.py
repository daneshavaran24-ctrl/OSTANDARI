"""
تست‌های لایه‌ی RPC.

مهم‌ترین چیزی که اینجا سنجیده می‌شود دو مهار است: فهرست مجاز متدها، و اینکه
**سکوت هرگز به‌معنای رضایت خوانده نشود**. اگر تأییدخواهی به هر دلیلی به نتیجه
نرسد، پاسخ باید «نه» باشد.
"""

import json
import types

import pytest
from livekit import rtc

import rpc
import storage


class FakeParticipant:
    def __init__(self, kind: int) -> None:
        self.kind = kind


AVATAR = FakeParticipant(rtc.ParticipantKind.PARTICIPANT_KIND_AGENT)
HUMAN = FakeParticipant(rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD)


class FakeLocalParticipant:
    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict] = []

    async def perform_rpc(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


@pytest.fixture
def room(monkeypatch):
    """اتاق جعلی با یک کاربر انسانی و یک آواتار."""

    def _set(response: object = '{"ok": true}', participants: dict | None = None):
        local = FakeLocalParticipant(response)
        fake = types.SimpleNamespace(
            remote_participants=participants
            if participants is not None
            else {"bey-avatar": AVATAR, "user-42": HUMAN},
            local_participant=local,
        )
        monkeypatch.setattr(
            rpc, "get_job_context", lambda: types.SimpleNamespace(room=fake)
        )
        return local

    return _set


@pytest.fixture(autouse=True)
def no_database(monkeypatch):
    """ثبت رخداد نباید به پایگاه داده‌ی واقعی بنویسد."""
    recorded: list[tuple] = []
    monkeypatch.setattr(
        storage,
        "record_rpc_event",
        lambda *args: recorded.append(args),
    )
    monkeypatch.setattr(
        rpc.storage, "record_rpc_event", lambda *args: recorded.append(args)
    )
    return recorded


# ---------------------------------------------------------------------------
# فهرست مجاز
# ---------------------------------------------------------------------------


async def test_unknown_method_is_rejected_before_it_reaches_the_network(
    room, no_database
):
    local = room()

    with pytest.raises(rpc.RpcError):
        await rpc.call_client("drop_database", {})

    # مهم: اصلاً نباید فرستاده شود، نه اینکه فرستاده و رد شود
    assert local.calls == []
    assert any(event[3] == "rejected" for event in no_database)


async def test_every_allowed_method_has_a_validator():
    # اگر کسی متدی به METHODS اضافه کند و اعتبارسنجش را یادش برود، payload
    # بدون بررسی به مرورگر می‌رسد.
    assert set(rpc.METHODS) == set(rpc._VALIDATORS)


# ---------------------------------------------------------------------------
# اعتبارسنجی payload
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        {"kind": "success"},
        {"kind": "success", "message": "   "},
        {"kind": "explode", "message": "سلام"},
        {"kind": "success", "message": "x" * (rpc.MAX_MESSAGE_LENGTH + 1)},
        {"message": "بدون نوع"},
    ],
)
async def test_invalid_notification_payload_is_refused(room, payload):
    local = room()
    with pytest.raises(rpc.RpcError):
        await rpc.call_client("show_notification", payload)
    assert local.calls == []


async def test_invalid_avatar_state_is_refused(room):
    local = room()
    with pytest.raises(rpc.RpcError):
        await rpc.call_client("set_avatar_state", {"state": "dancing"})
    assert local.calls == []


async def test_valid_call_carries_an_action_id(room):
    local = room()
    await rpc.call_client("set_avatar_state", {"state": "speaking"}, delay=0)

    assert len(local.calls) == 1
    payload = json.loads(local.calls[0]["payload"])
    assert payload["state"] == "speaking"
    # هر فراخوانی باید شناسه‌ی یکتا داشته باشد تا در rpc_events قابل ردیابی باشد
    assert len(payload["action_id"]) == 32


# ---------------------------------------------------------------------------
# انتخاب مخاطب
# ---------------------------------------------------------------------------


async def test_notification_goes_to_the_human_not_the_avatar(room):
    local = room()
    await rpc.call_client(
        "show_notification", {"kind": "info", "message": "سلام"}, delay=0
    )
    assert local.calls[0]["destination_identity"] == "user-42"


async def test_room_without_a_human_raises(room):
    room(participants={"bey-avatar": AVATAR})
    with pytest.raises(rpc.RpcError):
        rpc.human_participant_identity()


# ---------------------------------------------------------------------------
# notify: کار جانبی است و نباید ابزار را بشکند
# ---------------------------------------------------------------------------


async def test_notify_returns_false_instead_of_raising(room):
    room(response=TimeoutError("پاسخی نرسید"))
    assert await rpc.notify("سلام", delay=0) is False


async def test_notify_returns_true_on_success(room):
    room()
    assert await rpc.notify("سلام", delay=0) is True


async def test_notify_with_no_human_present_is_false_not_an_exception(room):
    room(participants={})
    assert await rpc.notify("سلام", delay=0) is False


# ---------------------------------------------------------------------------
# confirm: سکوت یعنی «نه»
# ---------------------------------------------------------------------------


async def test_confirm_true_only_when_the_user_confirms(room):
    room(response='{"confirmed": true}')
    assert await rpc.confirm("ارسال ایمیل", "به user@example.com فرستاده شود؟") is True


@pytest.mark.parametrize(
    "response",
    [
        '{"confirmed": false}',
        "{}",
        '{"confirmed": "true"}',  # رشته است، نه بولی
        '{"confirmed": 1}',
        "متن بی‌ربط",
        "",
        TimeoutError("کاربر پاسخ نداد"),
    ],
)
async def test_anything_other_than_an_explicit_yes_is_no(room, response):
    room(response=response)
    assert await rpc.confirm("ارسال ایمیل", "فرستاده شود؟") is False


async def test_confirm_waits_longer_than_a_notification(room):
    # تأییدخواهی منتظر کلیک کاربر است؛ با مهلت ۱۵ ثانیه‌ای اعلان، کاربری که
    # دارد ایمیلش را می‌خواند تأیید را از دست می‌دهد.
    assert (
        rpc.METHODS["show_confirmation"].timeout
        > rpc.METHODS["show_notification"].timeout
    )
