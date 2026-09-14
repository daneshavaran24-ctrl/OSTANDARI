"""تست ساخت دستورهای مدل از روی تنظیمات پنل."""

from prompts import AGENT_INSTRUCTIONS, compose_instructions

POLITICS = ("مسائل سیاسی", "در این باره نمی‌توانم صحبت کنم.")
RELIGION = ("مسائل دینی", "پاسخ به پرسش‌های دینی در حوزه‌ی کاری من نیست.")


def test_base_instructions_always_present() -> None:
    assert AGENT_INSTRUCTIONS in compose_instructions()
    assert AGENT_INSTRUCTIONS in compose_instructions([POLITICS], 30)


def test_no_restrictions_means_no_restriction_section() -> None:
    # نباید بخش خالی «موضوع‌هایی که نباید...» به پرامپت اضافه شود
    for empty in (None, []):
        assert "نباید درباره‌شان صحبت کنی" not in compose_instructions(empty)


def test_each_restriction_brings_its_topic_and_response() -> None:
    text = compose_instructions([POLITICS, RELIGION])

    for topic, response in (POLITICS, RELIGION):
        assert topic in text
        # متن پاسخ هم باید بیاید، وگرنه مدل جمله‌ی خودش را می‌سازد
        assert response in text


def test_restrictions_resist_insistence() -> None:
    # بدون این جمله، کاربر با «شوخی کردم» یا «نقش‌بازی کن» مدل را دور می‌زند
    text = compose_instructions([POLITICS])
    assert "هرگز نادیده نگیر" in text
    assert "نقش دیگری" in text


def test_short_session_adds_the_time_constraint() -> None:
    text = compose_instructions(session_seconds=30)

    assert "قید زمان" in text
    assert "30" in text
    # با ۳۰ ثانیه گردش‌کار تیکت جا نمی‌شود، پس مدل نباید سراغش برود
    assert "ثبت تیکت نرو" in text


def test_long_session_keeps_the_full_workflow() -> None:
    for seconds in (120, 600):
        assert "قید زمان" not in compose_instructions(session_seconds=seconds)


def test_missing_duration_adds_nothing() -> None:
    assert "قید زمان" not in compose_instructions(session_seconds=None)
