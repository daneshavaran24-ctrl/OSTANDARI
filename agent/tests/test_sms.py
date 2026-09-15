"""
تست‌های ارسال پیامک قاصدک.

سرورهای قاصدک از این محیط در دسترس نیستند، پس درخواست واقعی روی سیم نمی‌رود.
آنچه اینجا سنجیده می‌شود **پروتکل** است: دقیقاً چه چیزی به چه نشانی‌ای فرستاده
می‌شود، و پاسخ‌های مختلف چطور تعبیر می‌شوند. این پروتکل از روی سورس SDK رسمی
قاصدک (نسخه‌ی ۱.۰.۳) خوانده شده است، نه از حدس.

مهم‌ترین چیزی که آزموده می‌شود: **۲۰۰ به‌معنای موفقیت نیست.** این سرویس برای
اعتبار ناکافی و شماره‌ی نامعتبر هم ۲۰۰ برمی‌گرداند.
"""

import json

import httpx
import pytest

import sms

API_KEY = "test-api-key"


def transport(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ---------------------------------------------------------------------------
# شکل درخواست
# ---------------------------------------------------------------------------


async def test_request_matches_the_official_protocol():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"isSuccess": True, "data": {"messageId": 42}})

    async with transport(handler) as client:
        result = await sms.send_single(
            api_key=API_KEY,
            line_number="3000123",
            receptor="09121234567",
            message="سلام",
            client_reference_id="ref-1",
            client=client,
        )

    assert (
        seen["url"]
        == "https://gateway.ghasedak.me/Rest/api/v1/WebService/SendSingleSMS"
    )
    # کلید در هدر می‌رود، نه در نشانی — وگرنه در لاگ پروکسی‌ها می‌نشیند
    assert seen["headers"]["apikey"] == API_KEY
    assert API_KEY not in seen["url"]

    assert seen["body"] == {
        "LineNumber": "3000123",
        "Receptor": "09121234567",
        "Message": "سلام",
        "ClientReferenceId": "ref-1",
        "Udh": False,
    }
    assert result.message_id == "42"


async def test_client_reference_id_is_actually_sent():
    """
    نگهبان صریح، چون SDK رسمی دقیقاً همین را نمی‌فرستد.

    بدون این فیلد، «یک بار ارسال» قابل تضمین نیست: یک retry یعنی دو پیامک
    برای کاربر.
    """
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"isSuccess": True, "data": {"messageId": 1}})

    async with transport(handler) as client:
        await sms.send_single(
            api_key=API_KEY,
            line_number="3000",
            receptor="09121234567",
            message="متن",
            client_reference_id="یکتا-۱۲۳",
            client=client,
        )

    assert seen.get("ClientReferenceId") == "یکتا-۱۲۳"


# ---------------------------------------------------------------------------
# ۲۰۰ یعنی موفقیت نیست
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"isSuccess": False, "message": "اعتبار کافی نیست"},
        {"IsSuccess": False, "Message": "شماره نامعتبر است"},
        {"message": "خط ارسال یافت نشد"},  # بدون isSuccess و بدون شناسه‌ی پیام
    ],
)
async def test_two_hundred_with_a_failure_body_is_a_failure(body):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    async with transport(handler) as client:
        with pytest.raises(sms.SmsError):
            await sms.send_single(
                api_key=API_KEY,
                line_number="3000",
                receptor="09121234567",
                message="متن",
                client_reference_id="ref",
                client=client,
            )


async def test_a_message_id_without_an_explicit_flag_counts_as_success():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"messageId": "abc"}})

    async with transport(handler) as client:
        result = await sms.send_single(
            api_key=API_KEY,
            line_number="3000",
            receptor="09121234567",
            message="متن",
            client_reference_id="ref",
            client=client,
        )

    assert result.message_id == "abc"


async def test_message_id_is_read_from_a_list_response():
    # پاسخ ارسال تکی گاهی آرایه است
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"messageId": 7}]})

    async with transport(handler) as client:
        result = await sms.send_single(
            api_key=API_KEY,
            line_number="3000",
            receptor="09121234567",
            message="متن",
            client_reference_id="ref",
            client=client,
        )

    assert result.message_id == "7"


@pytest.mark.parametrize("status", [400, 401, 403, 500])
async def test_http_errors_raise(status):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"message": "خطا"})

    async with transport(handler) as client:
        with pytest.raises(sms.SmsError):
            await sms.send_single(
                api_key=API_KEY,
                line_number="3000",
                receptor="09121234567",
                message="متن",
                client_reference_id="ref",
                client=client,
            )


# ---------------------------------------------------------------------------
# مسیر خطا — همان جایی که SDK رسمی خودش می‌شکند
# ---------------------------------------------------------------------------


async def test_a_network_failure_raises_sms_error_not_something_else():
    """
    SDK رسمی اینجا `UnboundLocalError` می‌دهد، چون در مسیر خطا به یک
    `response` دست می‌زند که هرگز ساخته نشده.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("شبکه قطع است")

    async with transport(handler) as client:
        with pytest.raises(sms.SmsError) as error:
            await sms.send_single(
                api_key=API_KEY,
                line_number="3000",
                receptor="09121234567",
                message="متن",
                client_reference_id="ref",
                client=client,
            )

    assert "قاصدک" in str(error.value)


async def test_a_non_json_response_raises_sms_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>خطای پروکسی</html>")

    async with transport(handler) as client:
        with pytest.raises(sms.SmsError):
            await sms.send_single(
                api_key=API_KEY,
                line_number="3000",
                receptor="09121234567",
                message="متن",
                client_reference_id="ref",
                client=client,
            )


# ---------------------------------------------------------------------------
# اطلاعات حساب — برای دکمه‌ی آزمایش اتصال
# ---------------------------------------------------------------------------


async def test_account_information_reads_the_balance():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert str(request.url).endswith("GetAccountInformation")
        return httpx.Response(200, json={"data": {"credit": 12500, "plan": "pro"}})

    async with transport(handler) as client:
        payload = await sms.account_information(API_KEY, client)

    assert payload["data"]["credit"] == 12500


async def test_account_information_succeeds_without_an_is_success_flag():
    """
    نگهبان یک اشتباه واقعی: قاعده‌ی موفقیتِ «شناسه‌ی پیام دارد یا نه» برای این
    اندپوینت کار نمی‌کند، چون پاسخش اصلاً شناسه‌ی پیام ندارد.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"credit": 0}})

    async with transport(handler) as client:
        payload = await sms.account_information(API_KEY, client)

    assert payload["data"]["credit"] == 0


async def test_account_information_rejects_a_bad_key():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "کلید نامعتبر"})

    async with transport(handler) as client:
        with pytest.raises(sms.SmsError):
            await sms.account_information(API_KEY, client)


# ---------------------------------------------------------------------------
# کلید بدشکل
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_key",
    [
        "کلید-فارسی",  # کپی‌شده از یک پنل فارسی
        "key​with-zwsp",  # فاصله‌ی نامرئی، که دیده نمی‌شود
        "کلید ۱۲۳",
    ],
)
async def test_a_non_ascii_key_fails_gracefully(bad_key):
    """
    نگهبان یک خرابی واقعی که در اجرای دستی دیده شد.

    سرتیتر HTTP فقط ASCII می‌پذیرد و httpx برای بقیه `UnicodeEncodeError`
    می‌اندازد. آن استثنا `HTTPError` نیست، پس از `except` پایین‌دست رد می‌شد و
    به‌جای پیام «ارسال ناموفق بود» یک traceback خام به ایجنت می‌رسید — و ردیف
    `sms_events` تا ابد pending می‌ماند.
    """

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("درخواست اصلاً نباید ساخته شود")

    async with transport(handler) as client:
        with pytest.raises(sms.SmsError):
            await sms.send_single(
                api_key=bad_key,
                line_number="3000",
                receptor="09121234567",
                message="سلام",
                client_reference_id="ref",
                client=client,
            )
        with pytest.raises(sms.SmsError):
            await sms.account_information(bad_key, client)


# ---------------------------------------------------------------------------
# مطابقت با مستندات رسمی
# ---------------------------------------------------------------------------

# پاسخ نمونه، عیناً از مستندات رسمی SendSingleSMS
DOCUMENTED_RESPONSE = {
    "isSuccess": True,
    "statusCode": 200,
    "message": "",
    "data": {
        "receptors": "21*******",
        "lineNumber": "21*******",
        "cost": 3537,
        "messageId": "4248",
        "clientReferenceId": "",
        "message": "test dotnet package bulk",
        "sendDate": "2024-07-09T14:01:36.6632614+03:30",
    },
}


async def test_the_documented_success_response_is_understood():
    """
    نگهبان قرارداد: اگر روزی شکل پاسخ عوض شود یا تعبیر ما از آن بلغزد، اینجا
    می‌شکند نه وسط یک گفت‌وگوی واقعی.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=DOCUMENTED_RESPONSE)

    async with transport(handler) as client:
        result = await sms.send_single(
            api_key=API_KEY,
            line_number="30001234",
            receptor="09121234567",
            message="سلام",
            client_reference_id="ref-1",
            client=client,
        )

    assert result.message_id == "4248"
    # هزینه در پاسخ هست و در raw دست‌نخورده می‌ماند تا اگر روزی لازم شد،
    # بدون تغییر این لایه در دسترس باشد
    assert result.raw["data"]["cost"] == 3537


@pytest.mark.parametrize("mode", ["priority", "fastest", "cheapest"])
async def test_line_selection_keywords_pass_through_untouched(mode):
    """
    طبق مستندات، `lineNumber` می‌تواند به‌جای شماره‌ی خط یکی از این سه کلیدواژه
    باشد (یا شناسه‌ی بازوی بله). این لایه نباید درباره‌شان قضاوت کند.
    """
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=DOCUMENTED_RESPONSE)

    async with transport(handler) as client:
        await sms.send_single(
            api_key=API_KEY,
            line_number=mode,
            receptor="09121234567",
            message="سلام",
            client_reference_id="ref-2",
            client=client,
        )

    assert seen["body"]["LineNumber"] == mode
