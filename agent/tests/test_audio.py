"""
تست‌های انتخاب نویزگیر.

این تست‌ها شیء واقعی می‌سازند، نه ماک. کل ارزش این ماژول در همین نگاشت است، و
هر سه نویزگیر لایوکیت یک نوع یکسان (NoiseCancellationOptions) برمی‌گردانند —
پس بررسی «نوع» چیزی ثابت نمی‌کند و باید با خروجی واقعی خود پلاگین مقایسه شود.
فایل‌های مدل کنار بسته نصب می‌شوند، پس ساختشان آفلاین و سریع است.
"""

import pytest
from livekit.plugins import ai_coustics, noise_cancellation

import audio


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """هر تست از محیط تمیز شروع شود، نه از .env.local توسعه‌دهنده."""
    monkeypatch.delenv("NOISE_CANCELLATION", raising=False)
    monkeypatch.delenv("AI_COUSTICS_MODEL", raising=False)


# --------------------------------------------------------------------------
# پیش‌فرض
# --------------------------------------------------------------------------


def test_default_is_ai_coustics():
    """بدون تنظیم، رفتار باید دقیقاً همان قبل از انتخابی شدن بماند."""
    result = audio.build_noise_cancellation()
    assert isinstance(result, ai_coustics.plugin.AICousticsAudioEnhancer)


def test_empty_value_falls_back_to_default(monkeypatch):
    """NOISE_CANCELLATION= در .env.local یعنی پیش‌فرض، نه خاموش."""
    monkeypatch.setenv("NOISE_CANCELLATION", "   ")
    assert isinstance(
        audio.build_noise_cancellation(), ai_coustics.plugin.AICousticsAudioEnhancer
    )


# --------------------------------------------------------------------------
# نویزگیرهای لایوکیت
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "factory"),
    [
        ("nc", noise_cancellation.NC),
        ("bvc", noise_cancellation.BVC),
        ("bvc-telephony", noise_cancellation.BVCTelephony),
    ],
)
def test_livekit_filters_map_to_the_right_model(monkeypatch, value, factory):
    """
    هر مقدار باید همان مدلی را بار کند که خود پلاگین می‌دهد.

    تفاوت این سه فقط در options['modelPath'] است، پس مقایسه با خروجی مستقیم
    پلاگین تنها راهی است که یک نگاشت جابه‌جا را می‌گیرد.
    """
    monkeypatch.setenv("NOISE_CANCELLATION", value)
    assert audio.build_noise_cancellation().options == factory().options


def test_the_three_livekit_filters_are_actually_different():
    """
    نگهبان تست بالا: اگر این سه مدل یکسانی بار کنند، مقایسه‌ی بالا بی‌ارزش است.
    """
    paths = {
        f().options["modelPath"]
        for f in (
            noise_cancellation.NC,
            noise_cancellation.BVC,
            noise_cancellation.BVCTelephony,
        )
    }
    assert len(paths) == 3


@pytest.mark.parametrize("value", ["BVC", "  bvc  ", "Bvc-Telephony"])
def test_value_is_case_and_space_tolerant(monkeypatch, value):
    monkeypatch.setenv("NOISE_CANCELLATION", value)
    assert audio.build_noise_cancellation() is not None


# --------------------------------------------------------------------------
# خاموش کردن
# --------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["off", "none", "OFF", " disabled "])
def test_can_be_disabled(monkeypatch, value):
    monkeypatch.setenv("NOISE_CANCELLATION", value)
    assert audio.build_noise_cancellation() is None


# --------------------------------------------------------------------------
# مقادیر نامعتبر باید سروصدا کنند
# --------------------------------------------------------------------------


def test_unknown_value_raises_with_the_valid_options(monkeypatch):
    """
    غلط املایی نباید بی‌صدا به پیش‌فرض برگردد، وگرنه ماه‌ها با نویزگیر اشتباه
    کار می‌کنید بدون اینکه بفهمید.
    """
    monkeypatch.setenv("NOISE_CANCELLATION", "bcv")
    with pytest.raises(ValueError) as err:
        audio.build_noise_cancellation()

    message = str(err.value)
    assert "bcv" in message
    for choice in ("ai-coustics", "bvc", "bvc-telephony", "nc", "off"):
        assert choice in message, f"پیام خطا {choice} را نام نمی‌برد"


# --------------------------------------------------------------------------
# مدل ai-coustics
# --------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["QUAIL_L", "quail_vf_l", "rook-s"])
def test_ai_coustics_model_is_selectable(monkeypatch, name):
    monkeypatch.setenv("AI_COUSTICS_MODEL", name)
    assert isinstance(
        audio.build_noise_cancellation(), ai_coustics.plugin.AICousticsAudioEnhancer
    )


def test_unknown_ai_coustics_model_raises_with_the_valid_options(monkeypatch):
    monkeypatch.setenv("AI_COUSTICS_MODEL", "PENGUIN_XL")
    with pytest.raises(ValueError) as err:
        audio.build_noise_cancellation()

    message = str(err.value)
    assert "PENGUIN_XL" in message
    assert "QUAIL_VF_S" in message


def test_ai_coustics_model_is_ignored_for_livekit_filters(monkeypatch):
    """مدل نامعتبر ai-coustics نباید مسیر bvc را بشکند."""
    monkeypatch.setenv("NOISE_CANCELLATION", "bvc")
    monkeypatch.setenv("AI_COUSTICS_MODEL", "PENGUIN_XL")
    assert audio.build_noise_cancellation().options == noise_cancellation.BVC().options
