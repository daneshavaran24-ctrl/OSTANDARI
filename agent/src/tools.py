import asyncio
import json
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from livekit import rtc
from livekit.agents import RunContext, ToolError, function_tool, get_job_context

from guards import (
    GuardError,
    allowed_email_domains,
    check_and_count,
    normalize_username,
    validate_email_address,
    validate_email_content,
)

logger = logging.getLogger(__name__)

# مسیر فایل کاربران مسدودشده که اپ دمو آن را سرو می‌کند.
# این فایل در agent/src/ است، پس parents[2] ریشه‌ی مونوریپو می‌شود:
#   src/tools.py → parents[0]=src  parents[1]=agent  parents[2]=<ریشه>
DEFAULT_BLOCK_FILE = (
    Path(__file__).parents[2] / "demo-app" / "public" / "blockusers.txt"
)


def _block_file() -> Path:
    return Path(os.getenv("BLOCK_USERS_FILE", str(DEFAULT_BLOCK_FILE)))


def _session_id() -> str:
    """نام اتاق به‌عنوان شناسه‌ی نشست، برای شمارش سقف استفاده از ابزارها."""
    try:
        return get_job_context().room.name
    except Exception:  # بیرون از یک job واقعی (تست، یا قبل از اتصال)
        return "unknown-session"


def _human_participant_identity() -> str:
    """
    هویتِ کاربر انسانی داخل اتاق را برمی‌گرداند.

    آواتار Beyond Presence هم خودش یک participant مستقل است و با
    `.with_kind("agent")` وارد اتاق می‌شود، پس نمی‌توان صرفاً اولین عضو
    remote_participants را برداشت — بسته به ترتیب ورود ممکن است آواتار باشد.

    مقایسه با enum عددی protobuf انجام می‌شود، نه با نام رشته‌ای: مقدار
    `participant.kind` یک int است (PARTICIPANT_KIND_AGENT برابر ۴) و
    str() گرفتن از آن «4» می‌دهد، نه چیزی که به AGENT ختم شود.
    """
    room = get_job_context().room
    for identity, participant in room.remote_participants.items():
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            continue
        return identity
    raise ToolError("هیچ کاربری در اتاق حضور ندارد تا اعلان برایش ارسال شود.")


async def _notify_client(payload: dict[str, str]) -> str:
    """
    اعلان بصری را روی کلاینت نمایش می‌دهد.

    سه ثانیه مکث می‌کند تا اعلان هم‌زمان با پایان جمله‌ی ایجنت دیده شود،
    نه قبل از آن.
    """
    identity = _human_participant_identity()
    room = get_job_context().room

    await asyncio.sleep(3)
    return await room.local_participant.perform_rpc(
        destination_identity=identity,
        method="client.showNotification",
        payload=json.dumps(payload),
        response_timeout=30.0,
    )


@function_tool()
async def unblock_user(context: RunContext[None], username: str) -> str:
    """
    رفع مسدودیت یک کاربر مشخص تا بتواند دوباره وارد سامانه شود.
    """
    try:
        target = normalize_username(username)
        check_and_count("unblock_user", _session_id())
    except GuardError as e:
        logger.warning("درخواست unblock_user رد شد: %s", e)
        return str(e)

    block_file = _block_file()

    try:
        if not block_file.exists():
            logger.error("فایل کاربران مسدودشده پیدا نشد: %s", block_file)
            return "رفع مسدودیت ناموفق بود: فایل blockusers.txt پیدا نشد."

        # فقط همین کاربر حذف می‌شود. نسخه‌ی قبلی کل فایل را خالی می‌کرد، یعنی
        # با یک درخواست همه‌ی کاربران مسدود آزاد می‌شدند.
        lines = block_file.read_text(encoding="utf-8").splitlines()
        remaining = [ln for ln in lines if ln.strip().lower() != target]

        if len(remaining) == len(lines):
            logger.info("کاربر %s در فهرست مسدودی نبود", target)
            return (
                f"کاربر {target} در فهرست مسدودشده‌ها نیست، پس مسدودیتی برای "
                f"برداشتن وجود ندارد. مشکل ورود او علت دیگری دارد."
            )

        block_file.write_text("".join(f"{ln}\n" for ln in remaining), encoding="utf-8")
        logger.info(
            "کاربر %s از فهرست مسدودی حذف شد؛ %d کاربر دیگر دست‌نخورده ماند",
            target,
            len(remaining),
        )
    except OSError as e:
        logger.error("خطا در نوشتن فایل کاربران مسدودشده: %s", e)
        raise ToolError(
            "در حال حاضر امکان استفاده از ابزار unblock_user وجود ندارد."
        ) from e

    try:
        response = await _notify_client({"type": "unblock_user", "username": target})
        logger.info("پاسخ اعلان unblock_user: %s", response)
        return f"مسدودیت کاربر {target} برداشته شد و اعلان روی صفحه نمایش داده شد."
    except Exception as rpc_error:
        # مسدودیت واقعاً برداشته شده؛ فقط اعلان بصری نرسیده است.
        logger.error("خطای RPC هنگام ارسال اعلان unblock_user: %s", rpc_error)
        return (
            f"مسدودیت کاربر {target} برداشته شد، ولی نمایش اعلان روی صفحه "
            f"ناموفق بود: {rpc_error}"
        )


@function_tool()
async def send_email(
    context: RunContext[None],
    to_email: str,
    subject: str,
    message: str,
    cc_email: str | None = None,
) -> str:
    """
    ارسال ایمیل از طریق Gmail.

    Args:
        to_email: نشانی ایمیل گیرنده
        subject: موضوع ایمیل
        message: متن ایمیل
        cc_email: نشانی رونوشت (اختیاری)
    """
    # آرگومان‌ها را یک مدل زبانی تولید کرده و کاربر دیکته کرده است، پس قبل از
    # رسیدن به SMTP باید مثل ورودی یک API عمومی اعتبارسنجی شوند.
    try:
        to_email = validate_email_address(to_email, field="نشانی گیرنده")
        if cc_email:
            cc_email = validate_email_address(cc_email, field="نشانی رونوشت")
        subject, message = validate_email_content(subject, message)
        check_and_count("send_email", _session_id())
    except GuardError as e:
        logger.warning("درخواست send_email رد شد: %s", e)
        return str(e)

    smtp_server = "smtp.gmail.com"
    smtp_port = 587

    gmail_user = os.getenv("GMAIL_USER")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD")  # رمز اپلیکیشن، نه رمز اصلی حساب

    if not gmail_user or not gmail_password:
        logger.error("اطلاعات ورود Gmail در متغیرهای محیطی تنظیم نشده است")
        return "ارسال ایمیل ناموفق بود: اطلاعات ورود Gmail تنظیم نشده است."

    if not allowed_email_domains():
        logger.warning(
            "EMAIL_ALLOWED_DOMAINS تنظیم نشده است: ایجنت می‌تواند به هر نشانی "
            "ایمیل بفرستد. برای استقرار واقعی حتماً تنظیمش کنید."
        )

    try:
        msg = MIMEMultipart()
        msg["From"] = gmail_user
        msg["To"] = to_email
        msg["Subject"] = subject

        recipients = [to_email]
        if cc_email:
            msg["Cc"] = cc_email
            recipients.append(cc_email)

        msg.attach(MIMEText(message, "plain", "utf-8"))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(gmail_user, gmail_password)
            server.sendmail(gmail_user, recipients, msg.as_string())

        logger.info("ایمیل با موفقیت به %s ارسال شد", to_email)
    except smtplib.SMTPAuthenticationError:
        logger.error("احراز هویت Gmail ناموفق بود")
        return (
            "ارسال ایمیل ناموفق بود: خطای احراز هویت. اطلاعات ورود Gmail را بررسی کنید."
        )
    except smtplib.SMTPException as e:
        logger.error("خطای SMTP: %s", e)
        return f"ارسال ایمیل ناموفق بود: خطای SMTP — {e}"
    except Exception as e:
        logger.error("خطا هنگام ارسال ایمیل: %s", e)
        return f"هنگام ارسال ایمیل خطایی رخ داد: {e}"

    try:
        response = await _notify_client(
            {"type": "send_email", "email_address": to_email}
        )
        logger.info("پاسخ اعلان send_email: %s", response)
        return f"ایمیل به {to_email} ارسال شد و اعلان روی صفحه نمایش داده شد."
    except Exception as rpc_error:
        # ایمیل واقعاً ارسال شده؛ فقط اعلان بصری نرسیده است.
        logger.error("خطای RPC هنگام ارسال اعلان send_email: %s", rpc_error)
        return f"ایمیل به {to_email} ارسال شد، ولی نمایش اعلان روی صفحه ناموفق بود: {rpc_error}"
