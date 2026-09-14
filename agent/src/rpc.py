"""
لایه‌ی فراخوانی RPC از ایجنت به مرورگر کاربر.

چرا یک ماژول جدا؟ چون هر ابزاری که بخواهد چیزی روی صفحه‌ی کاربر نشان بدهد باید
از همین‌جا رد شود. پراکنده کردن `perform_rpc` در فایل ابزارها یعنی هر ابزار
تصمیم خودش را درباره‌ی نام متد، اعتبارسنجی و مهلت می‌گیرد.

سه مهار اینجا اعمال می‌شود:

1. **فهرست مجاز.** فقط متدهایی که مرورگر واقعاً ثبت کرده قابل فراخوانی‌اند.
   نام ناشناس رد و لاگ می‌شود، نه اینکه به شبکه برود و با خطای مبهم SDK
   برگردد.
2. **اعتبارسنجی payload.** شکل هر متد اینجا بررسی می‌شود. مرورگر هم دوباره
   بررسی می‌کند؛ این دو بررسی جایگزین هم نیستند.
3. **ثبت رخداد.** هر فراخوانی با مدت و نتیجه‌اش در `rpc_events` می‌نشیند.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

from livekit import rtc
from livekit.agents import get_job_context

import storage

logger = logging.getLogger("agent.rpc")

# مهلت پاسخ. تأییدخواهی منتظر کلیک کاربر می‌ماند، پس مهلتش بلندتر است.
DEFAULT_TIMEOUT = 15.0
CONFIRMATION_TIMEOUT = 120.0

MAX_MESSAGE_LENGTH = 300
MAX_TITLE_LENGTH = 120

NOTIFICATION_KINDS = frozenset({"success", "error", "warning", "info"})
AVATAR_STATES = frozenset(
    {"idle", "connecting", "listening", "thinking", "speaking", "error"}
)


class RpcError(Exception):
    """فراخوانی RPC انجام نشد. متن این خطا به کاربر نشان داده نمی‌شود."""


@dataclass(frozen=True)
class Method:
    """یک متد مجاز، به‌همراه اعتبارسنج payload و مهلت پاسخش."""

    name: str
    timeout: float


def _check_notification(payload: dict[str, Any]) -> None:
    kind = payload.get("kind")
    if kind not in NOTIFICATION_KINDS:
        raise RpcError(f"نوع اعلان نامعتبر: {kind!r}")

    message = payload.get("message")
    if not isinstance(message, str) or not message.strip():
        raise RpcError("متن اعلان خالی است.")
    if len(message) > MAX_MESSAGE_LENGTH:
        raise RpcError(f"متن اعلان بیش از {MAX_MESSAGE_LENGTH} کاراکتر است.")


def _check_confirmation(payload: dict[str, Any]) -> None:
    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        raise RpcError("عنوان تأییدخواهی خالی است.")
    if len(title) > MAX_TITLE_LENGTH:
        raise RpcError(f"عنوان بیش از {MAX_TITLE_LENGTH} کاراکتر است.")

    message = payload.get("message")
    if not isinstance(message, str) or not message.strip():
        raise RpcError("متن تأییدخواهی خالی است.")
    if len(message) > MAX_MESSAGE_LENGTH:
        raise RpcError(f"متن تأییدخواهی بیش از {MAX_MESSAGE_LENGTH} کاراکتر است.")


def _check_avatar_state(payload: dict[str, Any]) -> None:
    state = payload.get("state")
    if state not in AVATAR_STATES:
        raise RpcError(f"حالت آواتار نامعتبر: {state!r}")


def _check_permission_request(payload: dict[str, Any]) -> None:
    reason = payload.get("reason")
    if reason is not None and (
        not isinstance(reason, str) or len(reason) > MAX_MESSAGE_LENGTH
    ):
        raise RpcError("دلیل درخواست دسترسی نامعتبر است.")


# فهرست مجاز. هر ورودی اینجا باید در `frontend/rpc/` یک هندلر ثبت‌شده داشته
# باشد؛ وگرنه فراخوانی با خطای «متد پشتیبانی نمی‌شود» برمی‌گردد. متدهای
# فازهای بعدی (فرم ایمیل، نقشه، …) عمداً اینجا نیستند تا ایجنت نتواند چیزی را
# صدا بزند که هنوز واقعاً کار نمی‌کند.
_VALIDATORS = {
    "show_notification": _check_notification,
    "show_confirmation": _check_confirmation,
    "set_avatar_state": _check_avatar_state,
    "request_camera_permission": _check_permission_request,
    "request_screen_share": _check_permission_request,
}

METHODS = {
    "show_notification": Method("show_notification", DEFAULT_TIMEOUT),
    "show_confirmation": Method("show_confirmation", CONFIRMATION_TIMEOUT),
    "set_avatar_state": Method("set_avatar_state", DEFAULT_TIMEOUT),
    "request_camera_permission": Method(
        "request_camera_permission", CONFIRMATION_TIMEOUT
    ),
    "request_screen_share": Method("request_screen_share", CONFIRMATION_TIMEOUT),
}


def human_participant_identity() -> str:
    """
    شناسه‌ی کاربر انسانی در اتاق.

    آواتار هم یک شرکت‌کننده است و kind آن عدد است، نه رشته — مقایسه با متن
    هرگز درست نمی‌شود و اعلان به‌جای کاربر برای آواتار فرستاده می‌شود.
    """
    room = get_job_context().room
    for identity, participant in room.remote_participants.items():
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            continue
        return identity
    raise RpcError("هیچ کاربری در اتاق حضور ندارد.")


async def call_client(
    method: str,
    payload: dict[str, Any],
    *,
    conversation_id: int | None = None,
    delay: float = 0.0,
) -> dict[str, Any]:
    """
    یک متد مجاز را روی مرورگر کاربر اجرا می‌کند و پاسخش را برمی‌گرداند.

    `delay` برای هماهنگی با گفتار است: اگر اعلان پیش از تمام شدن جمله‌ی ایجنت
    ظاهر شود، کاربر آن را به جمله‌ی قبلی نسبت می‌دهد.
    """
    action_id = uuid.uuid4().hex

    if method not in METHODS:
        # این یعنی باگ در کد ایجنت، نه ورودی کاربر. باید بلند باشد.
        logger.error("متد RPC ناشناخته رد شد: %s", method)
        storage.record_rpc_event(
            conversation_id, action_id, method, "rejected", None, "متد مجاز نیست"
        )
        raise RpcError(f"متد RPC مجاز نیست: {method}")

    _VALIDATORS[method](payload)

    if delay > 0:
        await asyncio.sleep(delay)

    identity = human_participant_identity()
    room = get_job_context().room
    started = time.monotonic()

    try:
        raw = await room.local_participant.perform_rpc(
            destination_identity=identity,
            method=method,
            payload=json.dumps({**payload, "action_id": action_id}),
            response_timeout=METHODS[method].timeout,
        )
    except Exception as e:
        elapsed = int((time.monotonic() - started) * 1000)
        logger.warning("فراخوانی RPC %s ناموفق بود: %s", method, e)
        storage.record_rpc_event(
            conversation_id, action_id, method, "error", elapsed, str(e)
        )
        raise RpcError(f"{method} ناموفق بود") from e

    elapsed = int((time.monotonic() - started) * 1000)

    try:
        result = json.loads(raw) if raw else {}
    except json.JSONDecodeError as e:
        storage.record_rpc_event(
            conversation_id, action_id, method, "bad_response", elapsed, raw[:200]
        )
        raise RpcError(f"پاسخ {method} قابل خواندن نبود") from e

    if not isinstance(result, dict):
        storage.record_rpc_event(
            conversation_id,
            action_id,
            method,
            "bad_response",
            elapsed,
            str(result)[:200],
        )
        raise RpcError(f"پاسخ {method} شکل درستی نداشت")

    storage.record_rpc_event(conversation_id, action_id, method, "ok", elapsed, None)
    return result


async def notify(
    message: str,
    kind: str = "success",
    *,
    conversation_id: int | None = None,
    delay: float = 3.0,
) -> bool:
    """
    اعلان روی صفحه‌ی کاربر. اگر ناموفق بود False می‌دهد، استثنا پرتاب نمی‌کند.

    دلیلش این است که اعلان همیشه یک کار جانبی است: اگر ایمیل ارسال شده و فقط
    نمایش اعلان شکست خورده، ابزار نباید شکست‌خورده گزارش شود.
    """
    try:
        await call_client(
            "show_notification",
            {"kind": kind, "message": message},
            conversation_id=conversation_id,
            delay=delay,
        )
        return True
    except RpcError:
        return False


async def confirm(
    title: str,
    message: str,
    *,
    confirm_label: str = "تأیید",
    cancel_label: str = "انصراف",
    conversation_id: int | None = None,
) -> bool:
    """
    از کاربر تأیید صریح می‌گیرد.

    اگر تأییدخواهی به هر دلیلی انجام نشد — قطع اتصال، مهلت، بسته شدن تب —
    پاسخ **نه** است. سکوت هرگز نباید به‌معنای رضایت خوانده شود.
    """
    try:
        result = await call_client(
            "show_confirmation",
            {
                "title": title,
                "message": message,
                "confirm_label": confirm_label,
                "cancel_label": cancel_label,
            },
            conversation_id=conversation_id,
        )
    except RpcError:
        return False

    return result.get("confirmed") is True
