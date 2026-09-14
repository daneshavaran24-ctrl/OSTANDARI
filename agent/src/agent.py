import logging
import os

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    JobContext,
    cli,
    room_io,
)
from livekit.plugins import bey, openai

from audio import build_noise_cancellation
from prompts import AGENT_INSTRUCTIONS, GREETING_INSTRUCTIONS
from tools import send_email, unblock_user

# بارگذاری کلیدها از .env.local
load_dotenv(".env.local")

logger = logging.getLogger("agent")
logger.setLevel(logging.INFO)


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=AGENT_INSTRUCTIONS,
            tools=[unblock_user, send_email],
        )


server = AgentServer()


@server.rtc_session(agent_name="ostandari-support")
async def ostandari_support(ctx: JobContext) -> None:
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # مدل Realtime اوپن‌ای‌آی: صدا → استدلال → صدا
    session: AgentSession[None] = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime"),
            voice=os.getenv("OPENAI_VOICE", "cedar"),
        ),
    )

    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=build_noise_cancellation(),
            ),
            # ورودی تصویری لازم است تا ایجنت صفحه‌ی به‌اشتراک‌گذاشته‌شده را ببیند
            video_input=room_io.VideoInputOptions(),
        ),
    )

    # آواتار تصویری Beyond Presence.
    # باید بعد از session.start بیاید، چون خروجی صدای نشست را جایگزین می‌کند.
    # اگر شناسه‌ی آواتار تنظیم نشده باشد، گفت‌وگوی صوتی بدون تصویر ادامه می‌یابد.
    avatar_id = os.getenv("BEY_AVATAR_ID")
    if avatar_id:
        avatar = bey.AvatarSession(avatar_id=avatar_id)
        await avatar.start(session, room=ctx.room)
    else:
        logger.warning("BEY_AVATAR_ID تنظیم نشده است؛ بدون آواتار تصویری ادامه می‌دهیم.")

    # اتصال به اتاق LiveKit
    await ctx.connect()

    # صدای تایپ حین کار کردن ایجنت پخش می‌شود تا کاربر بداند منتظر بماند.
    # بعد از ctx.connect می‌آید، چون یک ترک صوتی روی اتاق منتشر می‌کند.
    background_audio = BackgroundAudioPlayer(
        thinking_sound=[
            AudioConfig(BuiltinAudioClip.KEYBOARD_TYPING, volume=1),
            AudioConfig(BuiltinAudioClip.KEYBOARD_TYPING2, volume=1),
        ],
    )
    await background_audio.start(room=ctx.room, agent_session=session)

    # سلام اولیه
    await session.generate_reply(instructions=GREETING_INSTRUCTIONS)


if __name__ == "__main__":
    cli.run_app(server)
