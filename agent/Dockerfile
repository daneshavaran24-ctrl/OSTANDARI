# syntax=docker/dockerfile:1

# تصویر رسمی uv روی دبیان Bookworm. نسخه‌ی پایتون روی ۳.۱۲ است چون
# pyproject.toml همین را الزام می‌کند (requires-python = ">=3.12") و چرخه‌ی
# وابستگی‌های livekit-agents 1.2.16 روی ۳.۱۴ آزموده نشده است.
ARG PYTHON_VERSION=3.12
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

# بافر نکردن stdout/stderr تا اگر برنامه کرش کرد، لاگ‌ها از دست نروند
ENV PYTHONUNBUFFERED=1

# کامپایل بایت‌کد در زمان نصب، تا اولین ایمپورت هزینه‌ی کامپایل را نپردازد.
# کولد-استارت ایجنت را کم می‌کند و بیلد را کمی کند می‌کند.
ENV UV_COMPILE_BYTECODE=1

# مدل‌های محلی در مسیر مشترکی دانلود شوند که همه‌ی مرحله‌ها ببینند
ENV HF_HOME=/app/.cache/huggingface
ENV TORCH_HOME=/app/.cache/torch

# --- مرحله‌ی بیلد ---
FROM base AS build

# ابزارهای کامپایل برای پکیج‌هایی که افزونه‌ی بومی دارند
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# اول فقط فایل‌های وابستگی کپی می‌شوند تا لایه‌ی نصب کش شود
COPY pyproject.toml uv.lock ./
RUN mkdir -p src

# --locked یعنی دقیقاً همان نسخه‌های uv.lock نصب شوند (بیلد بازتولیدپذیر).
# uv.lock باید در مخزن کامیت شده باشد.
RUN uv sync --locked --no-dev

# کپی بقیه‌ی فایل‌ها (با توجه به .dockerignore)
COPY . .

# پیش‌دانلود فایل‌های مدل پلاگین‌ها، بعد از کپی سورس چون این دستور کد ایجنت را
# ایمپورت می‌کند. در صورت شکست، بیلد نمی‌شکند و فقط کولد-استارت کندتر می‌شود.
RUN uv run --no-dev --frozen src/agent.py download-files || \
    echo "هشدار: پیش‌دانلود فایل‌ها انجام نشد؛ در اولین اجرا دانلود می‌شوند."

# --- مرحله‌ی نهایی ---
# ابزارهای کامپایل (gcc, g++, python3-dev) در ایمیج نهایی نیستند
FROM base

# کاربر بدون دسترسی ویژه
# https://docs.docker.com/build/building/best-practices/#user
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

# کپی برنامه و محیط مجازی با مالکیت درست در یک لایه، تا chown بازگشتی گران
# لازم نشود و ابزارهای بیلد وارد ایمیج نهایی نشوند
COPY --from=build --chown=appuser:appuser /app /app

WORKDIR /app
USER appuser

# «start» به ایجنت می‌گوید به LiveKit وصل شود و منتظر کار بماند.
# --no-dev تا pytest/ruff وارد ایمیج نشوند و --frozen تا uv در زمان استارت
# سراغ شبکه برای حل مجدد وابستگی‌ها نرود.
CMD ["uv", "run", "--no-dev", "--frozen", "src/agent.py", "start"]
