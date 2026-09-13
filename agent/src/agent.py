import os

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    RoomInputOptions,
)
from livekit.plugins import bey, noise_cancellation, openai

from prompts import AGENT_INSTRUCTIONS
from tools import send_email, unblock_user

load_dotenv(".env.local")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=AGENT_INSTRUCTIONS,
            tools=[unblock_user, send_email],
        )


async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice=os.getenv("OPENAI_VOICE", "coral"),
        )
    )

    avatar = bey.AvatarSession(
        avatar_id=os.getenv("BEY_AVATAR_ID"),  # شناسه‌ی آواتار Beyond Presence
    )

    # آواتار را راه بینداز و منتظر بمان تا وارد اتاق شود
    await avatar.start(session, room=ctx.room)

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            # برای کاربردهای تلفنی به‌جای BVC از BVCTelephony استفاده کنید
            noise_cancellation=noise_cancellation.BVC(),
            video_enabled=True,
        ),
    )

    # صدای تایپ، حین کار کردن ایجنت پخش می‌شود تا کاربر بداند منتظر بماند
    background_audio = BackgroundAudioPlayer(
        thinking_sound=[
            AudioConfig(BuiltinAudioClip.KEYBOARD_TYPING, volume=1),
            AudioConfig(BuiltinAudioClip.KEYBOARD_TYPING2, volume=1),
        ],
    )
    await background_audio.start(room=ctx.room, agent_session=session)

    await session.generate_reply(
        instructions=(
            "به کاربر سلام کن، خودت را به‌عنوان دستیار پشتیبانی استانداری معرفی کن "
            "و بپرس چه کمکی از دستت برمی‌آید. حتماً به فارسی شروع کن و کوتاه باش."
        )
    )


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
