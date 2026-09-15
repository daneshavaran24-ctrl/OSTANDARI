"""
ارسال پیامک از طریق قاصدک.

⚠️ چرا از SDK رسمی (`ghasedak_sms`) استفاده نشده، با اینکه مستندات همان را
پیشنهاد می‌کند؟ سورسش خوانده شد و دو مشکل داشت که هر دو برای این پروژه
تعیین‌کننده‌اند:

1. **`ClientReferenceId` را نمی‌فرستد.** پارامتر را می‌گیرد، نگه می‌دارد، و در
   `SendSingleSmsInput.to_dict()` عمداً کامنت شده است — در حالی که همه‌ی
   DTOهای دیگرش می‌فرستندش. بدون آن، شناسه‌ی یکتای ما به سرور نمی‌رسد و
   «یک بار ارسال» قابل تضمین نیست: یک retry یعنی دو پیامک برای کاربر.

2. **مسیر خطایش خودش خطا می‌دهد.** در `except RequestException` به
   `response.status_code` دست می‌زند در حالی که اگر درخواست پرتاب کرده باشد،
   `response` اصلاً تعریف نشده و `UnboundLocalError` می‌گیرید — یعنی دقیقاً در
   لحظه‌ی قطعی شبکه، خطای نامربوط می‌بینید.

به‌علاوه آن SDK روی `requests` سوار است که همگام است؛ فراخوانی همگام داخل
حلقه‌ی رویداد ایجنت، گفت‌وگوی صوتی را قفل می‌کند.

پس همان پروتکل — که از روی سورس خودشان خوانده شده — مستقیم با httpx (که از
قبل وابستگی پروژه است) صدا زده می‌شود.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger("agent.sms")

# از سورس SDK رسمی قاصدک، نسخه‌ی ۱.۰.۳
BASE_URL = "https://gateway.ghasedak.me/Rest/api/v1/WebService/"

TIMEOUT_SECONDS = 20.0


class SmsError(Exception):
    """ارسال پیامک انجام نشد. متن این خطا به کاربر نشان داده نمی‌شود."""


@dataclass(frozen=True)
class SmsResult:
    """نتیجه‌ی یک ارسال موفق."""

    message_id: str | None
    raw: dict[str, Any]


def _headers(api_key: str) -> dict[str, str]:
    """
    سرتیترهای درخواست.

    ⚠️ کلید اینجا بررسی می‌شود چون سرتیتر HTTP فقط ASCII می‌پذیرد و httpx برای
    هر چیز دیگری `UnicodeEncodeError` می‌اندازد — که `HTTPError` نیست، پس از
    مهار پایین‌دست رد می‌شود و به‌جای «ارسال ناموفق بود» یک استثنای خام به ایجنت
    می‌رسد و ردیف `sms_events` برای همیشه در حالت pending می‌ماند.

    یک کلید با نویسه‌ی فارسی یا فاصله‌ی نامرئی سناریوی دور از ذهنی نیست: مدیر
    آن را از یک پنل فارسی کپی می‌کند.
    """
    if not api_key.isascii():
        raise SmsError("کلید قاصدک نویسه‌ی غیرمجاز دارد؛ دوباره کپی‌اش کنید.")

    return {
        "Accept": "application/json",
        "cache-control": "no-cache",
        "ApiKey": api_key,
    }


def _describe(payload: dict[str, Any], status: int) -> str:
    """
    پیام خطای قاصدک را برای **لاگ** آماده می‌کند، نه برای کاربر.

    پاسخ‌های این سرویس ساختار ثابتی ندارند، پس چند کلید محتمل بررسی می‌شود و
    اگر هیچ‌کدام نبود، خود پاسخ کوتاه‌شده لاگ می‌شود.
    """
    for key in ("message", "Message", "error", "Error"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return f"{status}: {value.strip()}"
    return f"{status}: {str(payload)[:200]}"


def _succeeded(
    payload: dict[str, Any],
    status: int,
    fallback: Callable[[dict[str, Any]], bool],
) -> bool:
    """
    آیا درخواست واقعاً موفق بوده است؟

    ⚠️ کد ۲۰۰ کافی نیست. این سرویس برای خطاهای منطقی (اعتبار ناکافی، شماره‌ی
    نامعتبر، خط اشتباه) هم ۲۰۰ برمی‌گرداند و وضعیت واقعی داخل بدنه است.

    اگر فیلد صریح `isSuccess` نبود، `fallback` تصمیم می‌گیرد — چون نشانه‌ی
    موفقیت برای هر اندپوینت فرق دارد: ارسال، شناسه‌ی پیام می‌دهد؛ اطلاعات
    حساب، بخش `data`.
    """
    if status >= 400:
        return False

    for key in ("isSuccess", "IsSuccess"):
        if key in payload:
            return bool(payload[key])

    return fallback(payload)


def _has_data(payload: dict[str, Any]) -> bool:
    data = payload.get("data") or payload.get("Data")
    return isinstance(data, dict) and bool(data)


def _has_message_id(payload: dict[str, Any]) -> bool:
    return _message_id(payload) is not None


def _message_id(payload: dict[str, Any]) -> str | None:
    data = payload.get("data") or payload.get("Data")

    if isinstance(data, dict):
        for key in ("messageId", "MessageId", "id", "Id"):
            value = data.get(key)
            if value not in (None, ""):
                return str(value)

    # پاسخ ارسال تکی گاهی آرایه‌ای از آیتم‌هاست
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            for key in ("messageId", "MessageId", "id", "Id"):
                value = first.get(key)
                if value not in (None, ""):
                    return str(value)

    return None


async def _post(
    path: str,
    api_key: str,
    body: dict[str, Any],
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    async def _send(session: httpx.AsyncClient) -> httpx.Response:
        return await session.post(
            f"{BASE_URL}{path}",
            headers=_headers(api_key),
            json=body,
            timeout=TIMEOUT_SECONDS,
        )

    try:
        if client is not None:
            response = await _send(client)
        else:
            async with httpx.AsyncClient() as session:
                response = await _send(session)
    except httpx.HTTPError as e:
        # برخلاف SDK رسمی، اینجا به response دست نمی‌زنیم — وقتی درخواست پرتاب
        # کرده، چیزی برای خواندن وجود ندارد.
        raise SmsError(f"اتصال به قاصدک ممکن نشد: {e}") from e

    try:
        payload = response.json()
    except ValueError as e:
        raise SmsError(f"پاسخ قاصدک JSON نبود ({response.status_code})") from e

    if not isinstance(payload, dict):
        raise SmsError(f"پاسخ قاصدک شکل غیرمنتظره داشت: {str(payload)[:200]}")

    if not _succeeded(payload, response.status_code, _has_message_id):
        raise SmsError(_describe(payload, response.status_code))

    return payload


async def send_single(
    *,
    api_key: str,
    line_number: str,
    receptor: str,
    message: str,
    client_reference_id: str,
    client: httpx.AsyncClient | None = None,
) -> SmsResult:
    """
    یک پیامک می‌فرستد.

    `client_reference_id` شناسه‌ی یکتای ماست و برای **یک‌بار-ارسال** لازم است:
    اگر پاسخ گم شود و دوباره تلاش کنیم، همین شناسه تشخیص می‌دهد که آیا پیام
    قبلاً پذیرفته شده یا نه.

    `line_number` طبق مستندات رسمی می‌تواند شماره‌ی خط باشد یا یکی از
    کلیدواژه‌های `priority` / `fastest` / `cheapest` (یا شناسه‌ی بازوی بله).
    اینجا درباره‌اش قضاوت نمی‌شود و همان‌طور که آمده فرستاده می‌شود.
    """
    body = {
        "LineNumber": line_number,
        "Receptor": receptor,
        "Message": message,
        "ClientReferenceId": client_reference_id,
        # در مستندات عمومی نیامده ولی SDK رسمی می‌فرستدش و سرور می‌پذیرد؛
        # حذفش سودی ندارد و ریسک دارد.
        "Udh": False,
    }

    payload = await _post("SendSingleSMS", api_key, body, client)
    return SmsResult(message_id=_message_id(payload), raw=payload)


async def account_information(
    api_key: str, client: httpx.AsyncClient | None = None
) -> dict[str, Any]:
    """
    اعتبار و وضعیت حساب.

    برای دکمه‌ی «آزمایش اتصال» در پنل است: کلید و دسترسی شبکه را می‌سنجد بدون
    اینکه پیامکی بفرستد یا اعتباری خرج کند.
    """

    async def _send(session: httpx.AsyncClient) -> httpx.Response:
        return await session.get(
            f"{BASE_URL}GetAccountInformation",
            headers=_headers(api_key),
            timeout=TIMEOUT_SECONDS,
        )

    try:
        if client is not None:
            response = await _send(client)
        else:
            async with httpx.AsyncClient() as session:
                response = await _send(session)
    except httpx.HTTPError as e:
        raise SmsError(f"اتصال به قاصدک ممکن نشد: {e}") from e

    try:
        payload = response.json()
    except ValueError as e:
        raise SmsError(f"پاسخ قاصدک JSON نبود ({response.status_code})") from e

    if not isinstance(payload, dict) or not _succeeded(
        payload, response.status_code, _has_data
    ):
        raise SmsError(
            _describe(
                payload if isinstance(payload, dict) else {}, response.status_code
            )
        )

    return payload
