# ایمیج ترکیبی: پنل/رابط کاربری (Next.js) و ایجنت صوتی (Python) در یک کانتینر.
#
# چرا یکی؟ چون هر دو به **یک فایل SQLite مشترک** نیاز دارند: پنل تنظیمات و
# کلیدها را می‌نویسد و ایجنت می‌خواندشان، و ایجنت رونوشت را می‌نویسد و پنل
# نشانش می‌دهد. دو کانتینر جدا یعنی دو فایل‌سیستم جدا و این پیوند می‌شکند.
#
# ⚠️ این فایل عمداً **فقط از ویژگی‌های بیلدر کلاسیک داکر** استفاده می‌کند.
# لیارا BuildKit ندارد؛ `RUN --mount`، heredoc و امثالشان آنجا با خطای
# «requires BuildKit» می‌شکنند. CI هم با DOCKER_BUILDKIT=0 می‌سازد تا همین
# محیط را بازتولید کند — وگرنه سبز بودنش چیزی درباره‌ی استقرار نمی‌گوید.

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.12

# ---------------------------------------------------------------------------
# مرحله‌ی ۱ — بیلد فرانت‌اند
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS frontend-build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# بدون این، corepack در محیط بدون ترمینال ممکن است منتظر تأیید دانلود بماند
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /build

# اول فقط فایل‌های وابستگی، تا لایه‌ی نصب با تغییر کد باطل نشود
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# ---------------------------------------------------------------------------
# مرحله‌ی ۲ — وابستگی‌های ایجنت
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS agent-build

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# مدل‌های محلی در مسیری دانلود شوند که به ایمیج نهایی هم می‌رسد
ENV HF_HOME=/app/agent/.cache/huggingface
ENV TORCH_HOME=/app/agent/.cache/torch

# ابزارهای کامپایل برای پکیج‌هایی که افزونه‌ی بومی دارند
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ python3-dev \
    && rm -rf /var/lib/apt/lists/*

# ⚠️ مسیر بیلد عمداً همان مسیر رانتایم است. اگر venv جابه‌جا شود، به مسیرهای
# مطلق داخل خودش تکیه می‌کنیم؛ ساختنش در جای نهایی این ریسک را حذف می‌کند.
WORKDIR /app/agent

COPY agent/pyproject.toml agent/uv.lock ./
RUN mkdir -p src
# --locked یعنی دقیقاً همان نسخه‌های uv.lock (بیلد بازتولیدپذیر)
RUN uv sync --locked --no-dev

# پیش‌دانلود فایل‌های مدل پلاگین‌ها. بدون این، اولین گفت‌وگوی واقعی منتظر
# دانلود می‌ماند و چون کش ماندگار نیست، با هر ریستارت دوباره تکرار می‌شود.
# این دستور به کلید API نیاز ندارد، پس پیش از کپی کد اجرا می‌شود تا لایه‌اش
# با تغییر کد باطل نشود.
RUN uv run --no-dev --frozen --module livekit.agents download-files

# ---------------------------------------------------------------------------
# مرحله‌ی ۳ — رانتایم
# ---------------------------------------------------------------------------
#
# پایه همان ایمیج پایتونی است که venv با آن ساخته شد. اگر پایه را عوض کنید،
# venv به مفسری اشاره می‌کند که وجود ندارد و کانتینر با خطای مبهم بالا
# نمی‌آید. Node فقط به‌صورت یک باینری از ایمیج رسمی برداشته می‌شود، چون
# دبیان bookworm نسخه‌ی ۲۲ ندارد و `node:sqlite` از ۲۲.۵ آمده است.
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS runtime

# ⚠️ اعلام دوباره لازم است: ARGهای پیش از اولین FROM داخل هیچ مرحله‌ای در
# دسترس نیستند. بدون این خط، تگ زیر به `node:-bookworm-slim` بسط می‌یابد.
ARG NODE_VERSION

COPY --from=node:${NODE_VERSION}-bookworm-slim /usr/local/bin/node /usr/local/bin/node

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV HF_HOME=/app/agent/.cache/huggingface
ENV TORCH_HOME=/app/agent/.cache/torch

# مسیر پیش‌فرض پایگاه داده روی دیسک ماندگار. اگر دیسک سوار نشود، entrypoint
# با پیام روشن متوقف می‌شود به‌جای ساختن یک پایگاه داده‌ی موقت.
ENV DATABASE_PATH=/app/data/ostandari.db

# کاربر پیش از کپی‌ها ساخته می‌شود تا هر COPY بتواند --chown بدهد. یک
# `chown -R` بعد از کپی، در بیلدر کلاسیک یک لایه‌ی کامل تازه از کل درخت
# می‌سازد و حجم ایمیج را تقریباً دو برابر می‌کند (venv حدود ۶۳۴ مگابایت است).
ARG UID=10001
RUN adduser --disabled-password --gecos "" --home /app --shell /sbin/nologin --uid ${UID} appuser \
    && mkdir -p /app/data \
    && chown appuser:appuser /app /app/data

WORKDIR /app

# اسکیما و اسکریپت مهاجرت
COPY --chown=appuser:appuser db/ ./db/

# فرانت‌اند: خروجی standalone + دارایی‌های ایستا (که standalone شاملشان نیست)
COPY --from=frontend-build --chown=appuser:appuser /build/.next/standalone/ ./frontend/
COPY --from=frontend-build --chown=appuser:appuser /build/.next/static/ ./frontend/.next/static/
COPY --from=frontend-build --chown=appuser:appuser /build/public/ ./frontend/public/

# ایجنت: محیط مجازی، کش مدل‌ها و کد — همه در همان مسیری که ساخته شدند
COPY --from=agent-build --chown=appuser:appuser /app/agent/ ./agent/
COPY --chown=appuser:appuser agent/src/ ./agent/src/

COPY --chown=appuser:appuser docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER appuser

EXPOSE 3000

CMD ["/usr/local/bin/entrypoint.sh"]
