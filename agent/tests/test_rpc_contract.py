"""
قرارداد RPC بین دو زبان باید یکی بماند.

ایجنت (پایتون) متد را صدا می‌زند و مرورگر (TypeScript) آن را ثبت می‌کند. اگر
فهرست مجاز یا سقف طول رشته‌ها در دو طرف از هم دور بیفتد، خرابی **در زمان اجرا**
و فقط با یک کاربر واقعی معلوم می‌شود: ایجنت متدی را صدا می‌زند که ثبت نشده، یا
پیامی می‌فرستد که مرورگر ردش می‌کند. هیچ تست تک‌زبانه‌ای این را نمی‌گیرد.

همان دلیلی که `scripts/check-crypto-interop.sh` جدا نوشته شد.
"""

import re
from pathlib import Path

import rpc

SCHEMAS_TS = Path(__file__).parents[2] / "frontend" / "rpc" / "schemas.ts"


def _typescript() -> str:
    assert SCHEMAS_TS.exists(), f"فایل قرارداد سمت مرورگر پیدا نشد: {SCHEMAS_TS}"
    return SCHEMAS_TS.read_text(encoding="utf-8")


def _string_list(source: str, name: str) -> set[str]:
    """مقادیر یک آرایه‌ی ثابت رشته‌ای را از TypeScript بیرون می‌کشد."""
    match = re.search(rf"export const {name} = \[(.*?)\] as const;", source, re.DOTALL)
    assert match, f"{name} در schemas.ts پیدا نشد"
    return set(re.findall(r"'([^']+)'", match.group(1)))


def _number(source: str, name: str) -> int:
    match = re.search(rf"export const {name} = (\d+);", source)
    assert match, f"{name} در schemas.ts پیدا نشد"
    return int(match.group(1))


def test_allowed_methods_match() -> None:
    source = _typescript()
    block = re.search(
        r"export const RPC_SCHEMAS = \{(.*?)\} as const;", source, re.DOTALL
    )
    assert block, "RPC_SCHEMAS در schemas.ts پیدا نشد"

    browser_methods = set(re.findall(r"^\s{2}(\w+):", block.group(1), re.MULTILINE))
    assert browser_methods == set(rpc.METHODS), (
        f"فهرست مجاز دو طرف یکی نیست.\n"
        f"فقط در پایتون: {set(rpc.METHODS) - browser_methods}\n"
        f"فقط در مرورگر: {browser_methods - set(rpc.METHODS)}"
    )


def test_notification_kinds_match() -> None:
    assert _string_list(_typescript(), "NOTIFICATION_KINDS") == rpc.NOTIFICATION_KINDS


def test_avatar_states_match() -> None:
    assert _string_list(_typescript(), "AVATAR_STATES") == rpc.AVATAR_STATES


def test_length_limits_match() -> None:
    source = _typescript()
    # اگر سقف پایتون بزرگ‌تر باشد، پیام از فیلتر ایجنت رد می‌شود و مرورگر
    # ردش می‌کند — یعنی اعلان بی‌صدا گم می‌شود.
    assert _number(source, "MAX_MESSAGE_LENGTH") == rpc.MAX_MESSAGE_LENGTH
    assert _number(source, "MAX_TITLE_LENGTH") == rpc.MAX_TITLE_LENGTH
