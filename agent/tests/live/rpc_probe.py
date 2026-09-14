#!/usr/bin/env python
"""
یک ایجنت واقعی که فقط RPC می‌زند — برای آزمون رفت‌وبرگشت زنده.

چرا؟ تا امروز قرارداد RPC فقط با مقایسه‌ی دو فایل آزموده می‌شد. این اسکریپت
همان `src/rpc.py` تولید را روی یک سرور واقعی LiveKit اجرا می‌کند و پاسخ واقعی
مرورگر را برمی‌گرداند. یعنی این‌ها برای اولین بار واقعاً سنجیده می‌شوند:

  * مینت شدن توکن و اتصال WebRTC
  * تشخیص درست شرکت‌کننده‌ی انسانی از روی `kind` عددی
  * سریال‌سازی payload و عبورش از کانال داده
  * اعتبارسنجی zod در مرورگر روی داده‌ای که واقعاً از شبکه آمده
  * پاسخ برگشتی و تجزیه‌اش در پایتون

مدل زبانی، صدا و آواتار اینجا نقشی ندارند؛ آن‌ها در `voice_probe.py` می‌آیند.
این اسکریپت هیچ کلید پولی لازم ندارد و با یک سرور محلی هم کار می‌کند.

    uv run python tests/live/rpc_probe.py --scenario notification

خروجی: یک خط JSON روی stdout.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "src"))

from livekit import api, rtc

import rpc

IDENTITY = "rpc-probe"
JOIN_TIMEOUT = 20.0


def _out(payload: dict[str, object]) -> None:
    """تنها چیزی که روی stdout می‌رود همین است، تا تست بتواند تجزیه‌اش کند."""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


async def _find_room(explicit: str | None) -> str:
    """
    نام اتاقی که مرورگر در آن است.

    نام اتاق را فرانت‌اند می‌سازد و تصادفی است، پس اینجا از API سرور پرسیده
    می‌شود. بدیل‌ها بدتر بودند: ثابت کردن نام اتاق یعنی تغییر کد تولید فقط
    به‌خاطر تست.

    ⚠️ روی `Room.num_participants` حساب نمی‌کنیم. آن شمارنده در حالت توسعه
    به‌روز نمی‌شود و صفر می‌ماند حتی وقتی شرکت‌کننده‌ای واقعاً در اتاق است —
    همین یک بار باعث شد تست به‌اشتباه بگوید «مرورگر وصل نشده». فهرست واقعی
    شرکت‌کننده‌ها منبع درست است.
    """
    if explicit:
        return explicit

    deadline = asyncio.get_running_loop().time() + JOIN_TIMEOUT

    while True:
        async with api.LiveKitAPI() as lk:
            rooms = await lk.room.list_rooms(api.ListRoomsRequest())
            occupied = []
            for room in rooms.rooms:
                people = await lk.room.list_participants(
                    api.ListParticipantsRequest(room=room.name)
                )
                if any(
                    p.kind != api.ParticipantInfo.Kind.AGENT
                    for p in people.participants
                ):
                    occupied.append(room)

        if occupied:
            # تازه‌ترین اتاق، تا اجرای قبلی تست را نگیرد
            return max(occupied, key=lambda r: r.creation_time).name

        if asyncio.get_running_loop().time() >= deadline:
            raise RuntimeError("هیچ اتاقی با کاربر پیدا نشد؛ آیا مرورگر وصل شده است؟")

        await asyncio.sleep(0.5)


async def _connect(room_name: str) -> rtc.Room:
    token = (
        api.AccessToken()
        .with_identity(IDENTITY)
        .with_name(IDENTITY)
        .with_kind("agent")  # مثل ایجنت واقعی، تا مرورگر آن را کاربر نشمارد
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .to_jwt()
    )

    room = rtc.Room()
    await room.connect(os.environ["LIVEKIT_URL"], token)

    # تا وقتی مرورگر در فهرست شرکت‌کننده‌ها ننشسته، مقصدی برای RPC نیست.
    deadline = asyncio.get_running_loop().time() + JOIN_TIMEOUT
    while asyncio.get_running_loop().time() < deadline:
        try:
            rpc.human_participant_identity(room)
            return room
        except rpc.RpcError:
            await asyncio.sleep(0.25)

    raise RuntimeError("کاربر انسانی در اتاق پیدا نشد")


async def scenario_notification(room: rtc.Room) -> dict[str, object]:
    result = await rpc.call_client(
        "show_notification",
        {"kind": "success", "message": "ایمیل با موفقیت ارسال شد."},
        room=room,
        delay=0,
    )
    return {"scenario": "notification", "result": result}


async def scenario_confirmation(room: rtc.Room) -> dict[str, object]:
    confirmed = await rpc.confirm(
        "ارسال ایمیل",
        "اطلاعات به user@example.com فرستاده شود؟",
        room=room,
    )
    return {"scenario": "confirmation", "confirmed": confirmed}


async def scenario_avatar_state(room: rtc.Room) -> dict[str, object]:
    result = await rpc.call_client("set_avatar_state", {"state": "thinking"}, room=room)
    return {"scenario": "avatar_state", "result": result}


async def scenario_invalid_payload(room: rtc.Room) -> dict[str, object]:
    """
    اعتبارسنجی مرورگر را مستقیماً می‌آزماید.

    عمداً `call_client` دور زده می‌شود، چون اعتبارسنج پایتون این payload را
    قبل از شبکه رد می‌کرد. سؤال این تست فرق دارد: اگر چیز نامعتبری **واقعاً**
    به مرورگر برسد، مرورگر چه می‌کند؟
    """
    identity = rpc.human_participant_identity(room)
    raw = await room.local_participant.perform_rpc(
        destination_identity=identity,
        method="show_notification",
        payload=json.dumps({"action_id": "x" * 32, "kind": "explode", "message": ""}),
        response_timeout=15.0,
    )
    return {"scenario": "invalid_payload", "raw": raw}


async def scenario_unknown_method(room: rtc.Room) -> dict[str, object]:
    """متدی که مرورگر ثبتش نکرده باید خطا بدهد، نه اینکه بی‌صدا موفق شود."""
    identity = rpc.human_participant_identity(room)
    try:
        raw = await room.local_participant.perform_rpc(
            destination_identity=identity,
            method="drop_database",
            payload="{}",
            response_timeout=10.0,
        )
    except Exception as e:
        return {
            "scenario": "unknown_method",
            "rejected": True,
            "error": type(e).__name__,
        }
    return {"scenario": "unknown_method", "rejected": False, "raw": raw}


SCENARIOS = {
    "notification": scenario_notification,
    "confirmation": scenario_confirmation,
    "avatar_state": scenario_avatar_state,
    "invalid_payload": scenario_invalid_payload,
    "unknown_method": scenario_unknown_method,
}


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", required=True, choices=sorted(SCENARIOS))
    parser.add_argument("--room", default=None, help="پیش‌فرض: از API سرور پیدا می‌شود")
    args = parser.parse_args()

    for variable in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        if not os.environ.get(variable):
            _out({"error": f"{variable} تنظیم نشده است"})
            return 2

    room = None
    try:
        room_name = await _find_room(args.room)
        room = await _connect(room_name)
        payload = await SCENARIOS[args.scenario](room)
        _out({"ok": True, "room": room_name, **payload})
        return 0
    except Exception as e:
        _out({"ok": False, "error": str(e), "type": type(e).__name__})
        return 1
    finally:
        if room is not None:
            await room.disconnect()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
