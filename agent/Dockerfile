# syntax=docker/dockerfile:1

# تصویر رسمی uv روی دبیان Bookworm.
#
# پروژه محدوده‌ی >=3.11,<3.15 را می‌پذیرد تا با محیط توسعه‌دهنده‌ها بخواند، ولی
# ایمیج استقرار عمداً روی یک نسخه‌ی مشخص و آزموده پین است. تست‌ها روی ۳.۱۱،
# ۳.۱۲ و ۳.۱۳ اجرا می‌شوند؛ اگر این را عوض کردید، در همان محدوده بمانید.
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

# پیش‌دانلود فایل‌های مدل پلاگین‌ها.
# دستور سطح-ماژول، پلاگین‌های نصب‌شده‌ی livekit-plugins-* را پیدا می‌کند بدون
# اینکه کد ایجنت را بارگذاری کند، پس نیازی به کلید ندارد و می‌تواند قبل از
# COPY . . اجرا شود تا لایه‌اش با تغییر کد باطل نشود.
RUN uv run --no-dev --frozen --module livekit.agents download-files

# کپی بقیه‌ی فایل‌ها (با توجه به .dockerignore)
COPY . .

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
