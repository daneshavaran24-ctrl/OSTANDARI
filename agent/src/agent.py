import asyncio
import logging
import os
import time

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

import storage
from audio import build_noise_cancellation
from prompts import GREETING_INSTRUCTIONS, compose_instructions
from tools import send_email, unblock_user

# بارگذاری کلیدها از .env.local
load_dotenv(".env.local")

logger = logging.getLogger("agent")
logger.setLevel(logging.INFO)

DEFAULT_SESSION_SECONDS = 300


class Assistant(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(
            instructions=instructions,
            tools=[unblock_user, send_email],
        )


server = AgentServer()


@server.rtc_session(agent_name="ostandari-support")
async def ostandari_support(ctx: JobContext) -> None:
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    if not storage.is_available():
        logger.warning(
            "پایگاه داده در دسترس نیست؛ از متغیرهای محیطی استفاده می‌شود و "
            "رونوشت گفت‌وگو ثبت نمی‌شود. برای ساختنش: node db/migrate.mjs"
        )

    session_seconds = storage.get_int_setting(
        "session_duration_seconds",
        "SESSION_DURATION_SECONDS",
        default=DEFAULT_SESSION_SECONDS,
    )

    restrictions = [(r.topic, r.response) for r in storage.get_restrictions()]
    instructions = compose_instructions(restrictions, session_seconds)
    logger.info(
        "نشست با %s ثانیه مهلت و %s محدودیت موضوعی شروع می‌شود",
        session_seconds,
        len(restrictions),
    )

    # کلیدها: پایگاه داده (رمزگشایی‌شده) → متغیر محیطی. اگر پنل کلیدی نداشته
    # باشد، همان .env.local امروز کار می‌کند.
    openai_key = storage.get_secret("openai_api_key", "OPENAI_API_KEY")
    if openai_key:
        os.environ["OPENAI_API_KEY"] = openai_key

    bey_key = storage.get_secret("bey_api_key", "BEY_API_KEY")
    if bey_key:
        os.environ["BEY_API_KEY"] = bey_key

    # مدل Realtime اوپن‌ای‌آی: صدا → استدلال → صدا
    session: AgentSession[None] = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model=storage.get_setting(
                "openai_realtime_model", "OPENAI_REALTIME_MODEL", "gpt-realtime"
            ),
            voice=storage.get_setting("openai_voice", "OPENAI_VOICE", "cedar"),
        ),
    )

    # --- ثبت رونوشت ---
    conversation_id = storage.start_conversation(ctx.room.name)
    transcript: list[tuple[str, str]] = []

    if conversation_id is not None:

        def on_item_added(event: object) -> None:
            item = getattr(event, "item", None)
            role = getattr(item, "role", None)
            content = getattr(item, "content", None)
            if role is None or content is None:
                return
            # content ممکن است فهرستی از قطعه‌ها باشد
            text = (
                " ".join(str(c) for c in content)
                if isinstance(content, list)
                else str(content)
            )
            if text.strip():
                transcript.append((str(role), text.strip()))

        session.on("conversation_item_added", on_item_added)

    await session.start(
        agent=Assistant(instructions),
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
    avatar_id = storage.get_setting("bey_avatar_id", "BEY_AVATAR_ID")
    if avatar_id:
        avatar = bey.AvatarSession(avatar_id=avatar_id)
        await avatar.start(session, room=ctx.room)
    else:
        logger.warning("شناسه‌ی آواتار تنظیم نشده است؛ بدون آواتار تصویری ادامه می‌دهیم.")

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

    started_at = time.monotonic()

    # سلام اولیه
    await session.generate_reply(instructions=GREETING_INSTRUCTIONS)

    # --- مهلت نشست ---
    # این لایه‌ی واقعی اجراست. شمارش معکوس در مرورگر فقط برای تجربه‌ی کاربری
    # است و هر کسی می‌تواند دورش بزند؛ بدون این تایمر، نشست باز می‌ماند و
    # هزینه‌ی مدل Realtime همچنان مصرف می‌شود.
    if session_seconds > 0:
        try:
            await asyncio.sleep(session_seconds)
            logger.info("مهلت %s ثانیه‌ای تمام شد؛ نشست بسته می‌شود", session_seconds)
        except asyncio.CancelledError:
            logger.info("نشست پیش از پایان مهلت بسته شد")
            raise
        finally:
            _persist(conversation_id, transcript, started_at)
            await ctx.room.disconnect()
    else:
        _persist(conversation_id, transcript, started_at)


def _persist(
    conversation_id: int | None,
    transcript: list[tuple[str, str]],
    started_at: float,
) -> None:
    """رونوشت را یک‌جا می‌نویسد و ردیف گفت‌وگو را می‌بندد."""
    if conversation_id is None:
        return
    storage.save_messages(conversation_id, transcript)
    storage.end_conversation(conversation_id, int(time.monotonic() - started_at))
    logger.info("رونوشت با %s پیام ذخیره شد", len(transcript))
    # رونوشت داده‌ی شخصی است؛ همین‌جا که به دیتابیس وصلیم و کاربر منتظر نیست،
    # موارد قدیمی‌تر از مدت نگه‌داری پاک می‌شوند.
    storage.purge_old_conversations()


if __name__ == "__main__":
    cli.run_app(server)
