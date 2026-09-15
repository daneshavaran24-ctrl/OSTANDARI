import logging
import os
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from livekit.agents import RunContext, ToolError, function_tool, get_job_context

import rpc
import sms
import storage
from guards import (
    GuardError,
    allowed_email_domains,
    check_and_count,
    normalize_mobile,
    normalize_username,
    validate_email_address,
    validate_email_content,
    validate_sms_text,
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

    # اعلان یک کار جانبی است: مسدودیت واقعاً برداشته شده، پس شکست نمایش اعلان
    # نباید به مدل گزارش شود که کار انجام نشده.
    shown = await rpc.notify(f"مسدودیت کاربر {target} برداشته شد.")
    if shown:
        return f"مسدودیت کاربر {target} برداشته شد و اعلان روی صفحه نمایش داده شد."
    return f"مسدودیت کاربر {target} برداشته شد، ولی نمایش اعلان روی صفحه ناموفق بود."


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

    shown = await rpc.notify(f"ایمیل با موفقیت به {to_email} ارسال شد.")
    if shown:
        return f"ایمیل به {to_email} ارسال شد و اعلان روی صفحه نمایش داده شد."
    return f"ایمیل به {to_email} ارسال شد، ولی نمایش اعلان روی صفحه ناموفق بود."


@function_tool()
async def send_sms(context: RunContext[None], mobile: str, message: str) -> str:
    """
    ارسال پیامک به شماره‌ی موبایلی که کاربر می‌گوید.

    پیش از ارسال، شماره و متن برای تأیید به کاربر نشان داده می‌شود. اگر کاربر
    تأیید نکند، هیچ پیامکی فرستاده نمی‌شود.
    """
    try:
        target = normalize_mobile(mobile)
        text = validate_sms_text(message)
        check_and_count("send_sms", _session_id())
    except GuardError as e:
        logger.warning("درخواست send_sms رد شد: %s", e)
        return str(e)

    api_key = storage.get_secret("sms_api_key", "GHASEDAK_API_KEY")
    line_number = storage.get_setting("sms_line_number", "GHASEDAK_LINE_NUMBER", "")

    if not api_key or not line_number:
        logger.error("پیامک پیکربندی نشده است (کلید یا شماره‌ی خط)")
        return (
            "ارسال پیامک در حال حاضر پیکربندی نشده است. به کاربر بگو این امکان "
            "فعلاً در دسترس نیست و راه دیگری پیشنهاد بده."
        )

    # 🔴 تأیید صریح، چون پیامکِ رفته را نمی‌شود پس گرفت. سکوت، قطع اتصال یا
    # بستن تب همه «نه» شمرده می‌شوند.
    confirmed = await rpc.confirm(
        "ارسال پیامک",
        f"پیامک به شماره‌ی {target} فرستاده شود؟\n\n{text}",
        confirm_label="بله، بفرست",
    )
    if not confirmed:
        logger.info("کاربر ارسال پیامک را تأیید نکرد")
        return "کاربر ارسال پیامک را تأیید نکرد. پیامکی فرستاده نشد."

    reference = uuid.uuid4().hex
    if not storage.claim_sms(None, reference, target):
        return "این پیامک قبلاً ثبت شده است و دوباره فرستاده نمی‌شود."

    try:
        result = await sms.send_single(
            api_key=api_key,
            line_number=line_number,
            receptor=target,
            message=text,
            client_reference_id=reference,
        )
    except sms.SmsError as e:
        # متن خطای سرویس به کاربر نمی‌رسد؛ فقط در لاگ می‌ماند.
        logger.error("ارسال پیامک به %s ناموفق بود: %s", target, e)
        storage.finish_sms(reference, "failed", error=str(e))
        return (
            "ارسال پیامک ناموفق بود. به کاربر بگو مشکلی پیش آمده و بعداً "
            "دوباره تلاش کند."
        )

    storage.finish_sms(reference, "sent", message_id=result.message_id)
    logger.info("پیامک به %s ارسال شد (شناسه: %s)", target, result.message_id)

    await rpc.notify(f"پیامک به شماره‌ی {target} ارسال شد.")
    return f"پیامک با موفقیت به {target} ارسال شد."
