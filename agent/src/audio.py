"""
انتخاب نویزگیر ورودی صدا از روی متغیرهای محیطی.

از src/agent.py جدا شده تا بدون بالا آوردن نشست LiveKit قابل تست باشد.
"""

import logging
import os
from typing import Any

from livekit.plugins import ai_coustics, noise_cancellation

logger = logging.getLogger("agent")

DEFAULT_NOISE_CANCELLATION = "ai-coustics"
DEFAULT_AI_COUSTICS_MODEL = "QUAIL_VF_S"

# مقادیری که نویزگیر را کاملاً خاموش می‌کنند
_DISABLED = frozenset({"off", "none", "disabled"})

# نویزگیرهای خود لایوکیت. هر سه NoiseCancellationOptions برمی‌گردانند و فقط در
# فایل مدلی که بار می‌کنند فرق دارند.
_LIVEKIT_FILTERS = {
    "nc": noise_cancellation.NC,
    "bvc": noise_cancellation.BVC,
    "bvc-telephony": noise_cancellation.BVCTelephony,
}

_VALID_CHOICES = ["ai-coustics", *_LIVEKIT_FILTERS, "off"]


def _ai_coustics_models() -> list[str]:
    return sorted(m for m in dir(ai_coustics.EnhancerModel) if m.isupper())


def _ai_coustics_model() -> Any:
    """مدل ai-coustics را از AI_COUSTICS_MODEL می‌خواند."""
    raw = os.getenv("AI_COUSTICS_MODEL", "").strip() or DEFAULT_AI_COUSTICS_MODEL
    name = raw.upper().replace("-", "_")

    model = getattr(ai_coustics.EnhancerModel, name, None)
    if model is None:
        raise ValueError(
            f"مقدار AI_COUSTICS_MODEL نامعتبر است: {raw!r}. "
            f"مقادیر معتبر: {', '.join(_ai_coustics_models())}"
        )
    return model


def build_noise_cancellation() -> Any:
    """
    نویزگیر ورودی صدا را می‌سازد تا به room_io.AudioInputOptions داده شود.

    با متغیر NOISE_CANCELLATION انتخاب می‌شود:

      ai-coustics     پیش‌فرض؛ مدلش با AI_COUSTICS_MODEL قابل تغییر است
      bvc             نویزگیر لایوکیت؛ صدای انسان‌های پس‌زمینه را هم حذف می‌کند
      bvc-telephony   نسخه‌ی BVC برای صدای باند-باریک تلفنی
      nc              نویزگیری ساده، بدون حذف صدای انسان‌های دیگر
      off             خاموش

    مقدار خالی یعنی پیش‌فرض. مقدار ناشناخته به‌جای بازگشت بی‌صدا به پیش‌فرض،
    استثنا می‌دهد — یک غلط املایی در .env.local نباید ساکت بماند و باعث شود
    ماه‌ها با نویزگیر اشتباه کار کنید.
    """
    raw = os.getenv("NOISE_CANCELLATION", "").strip() or DEFAULT_NOISE_CANCELLATION
    choice = raw.lower()

    if choice in _DISABLED:
        logger.info("نویزگیری خاموش است (NOISE_CANCELLATION=%s)", raw)
        return None

    if choice == "ai-coustics":
        model = _ai_coustics_model()
        logger.info("نویزگیری: ai-coustics با مدل %s", model.name)
        return ai_coustics.audio_enhancement(model=model)

    factory = _LIVEKIT_FILTERS.get(choice)
    if factory is None:
        raise ValueError(
            f"مقدار NOISE_CANCELLATION نامعتبر است: {raw!r}. "
            f"مقادیر معتبر: {', '.join(_VALID_CHOICES)}"
        )

    logger.info("نویزگیری: %s", choice)
    return factory()
