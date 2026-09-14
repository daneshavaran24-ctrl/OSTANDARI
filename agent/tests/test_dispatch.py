"""
نام ایجنت باید در دو طرف یکی بماند.

`@server.rtc_session(agent_name=...)` در LiveKit یعنی **اعزام صریح**: کار
به‌صورت خودکار به هیچ اتاقی فرستاده نمی‌شود و توکن کاربر باید نام ایجنت را
صریح بخواهد.

اگر این دو نام از هم دور بیفتند، هیچ خطایی رخ نمی‌دهد: مرورگر وصل می‌شود، اتاق
ساخته می‌شود، شمارش معکوس شروع می‌شود، و دستیار هرگز نمی‌آید. این تست دقیقاً
همان حالت خاموش را می‌گیرد.
"""

import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
AGENT_PY = ROOT / "agent" / "src" / "agent.py"
TOKEN_ROUTE = ROOT / "frontend" / "app" / "api" / "connection-details" / "route.ts"


def _agent_name_in_python() -> str:
    match = re.search(
        r'@server\.rtc_session\(agent_name="([^"]+)"\)', AGENT_PY.read_text("utf-8")
    )
    assert match, "ثبت ایجنت با agent_name در agent.py پیدا نشد"
    return match.group(1)


def _agent_name_in_token() -> str:
    source = TOKEN_ROUTE.read_text("utf-8")
    match = re.search(
        r"const AGENT_NAME = process\.env\.AGENT_NAME\?\.trim\(\) \|\| '([^']+)'",
        source,
    )
    assert match, "AGENT_NAME در مسیر صدور توکن پیدا نشد"
    return match.group(1)


def test_agent_name_matches_between_python_and_token() -> None:
    assert _agent_name_in_python() == _agent_name_in_token()


def test_the_token_actually_dispatches_an_agent() -> None:
    """
    وجود نام کافی نیست؛ باید واقعاً در roomConfig توکن نشسته باشد.

    بدون `RoomAgentDispatch`، نام درست هم هیچ کاری نمی‌کند.
    """
    source = TOKEN_ROUTE.read_text("utf-8")
    assert "RoomAgentDispatch" in source
    assert "roomConfig" in source
    assert re.search(
        r"agents:\s*\[new RoomAgentDispatch\(\{ agentName: AGENT_NAME \}\)\]", source
    ), "اعزام ایجنت باید از همان ثابت AGENT_NAME استفاده کند"
