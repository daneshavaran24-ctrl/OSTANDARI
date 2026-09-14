#!/usr/bin/env python
"""
وضعیت واقعی اتاق از دید سرور LiveKit.

آزمون‌های زنده نباید فقط به DOM تکیه کنند: یک ترک ممکن است در مرورگر رندر نشده
باشد ولی واقعاً منتشر شده باشد، یا برعکس. اینجا حقیقت سمت سرور خوانده می‌شود.

    uv run python tests/live/room_state.py

خروجی: یک خط JSON با فهرست اتاق‌ها، شرکت‌کننده‌ها، نوعشان و ترک‌هایشان.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

from livekit import api

KIND_NAMES = {
    api.ParticipantInfo.Kind.STANDARD: "standard",
    api.ParticipantInfo.Kind.INGRESS: "ingress",
    api.ParticipantInfo.Kind.EGRESS: "egress",
    api.ParticipantInfo.Kind.SIP: "sip",
    api.ParticipantInfo.Kind.AGENT: "agent",
}


async def main() -> int:
    for variable in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        if not os.environ.get(variable):
            sys.stdout.write(json.dumps({"error": f"{variable} تنظیم نشده است"}) + "\n")
            return 2

    rooms: list[dict[str, object]] = []
    async with api.LiveKitAPI() as lk:
        listing = await lk.room.list_rooms(api.ListRoomsRequest())
        for room in listing.rooms:
            people = await lk.room.list_participants(
                api.ListParticipantsRequest(room=room.name)
            )
            rooms.append(
                {
                    "name": room.name,
                    "participants": [
                        {
                            "identity": p.identity,
                            "kind": KIND_NAMES.get(p.kind, str(p.kind)),
                            "tracks": [
                                {
                                    "type": "video"
                                    if t.type == api.TrackType.VIDEO
                                    else "audio",
                                    "muted": t.muted,
                                }
                                for t in p.tracks
                            ],
                        }
                        for p in people.participants
                    ],
                }
            )

    sys.stdout.write(json.dumps({"rooms": rooms}, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
