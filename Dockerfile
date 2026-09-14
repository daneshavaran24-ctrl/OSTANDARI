# syntax=docker/dockerfile:1
#
# ایمیج ترکیبی: پنل/رابط کاربری (Next.js) و ایجنت صوتی (Python) در یک کانتینر.
#
# چرا یکی؟ چون هر دو به **یک فایل SQLite مشترک** نیاز دارند: پنل تنظیمات و
# کلیدها را می‌نویسد و ایجنت می‌خواندشان، و ایجنت رونوشت را می‌نویسد و پنل
# نشانش می‌دهد. دو کانتینر جدا یعنی دو فایل‌سیستم جدا و این پیوند می‌شکند.
#
# هزینه‌اش صریح است: مقیاس‌دهی جداگانه ممکن نیست و مرگ هر فرایند کل کانتینر را
# ریستارت می‌کند. اگر روزی لازم شد، مهاجرت به دو اپ + یک پایگاه داده‌ی
# مدیریت‌شده یک کار مستقل است (docs/DEPLOY.md).

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.12

# ---------------------------------------------------------------------------
# مرحله‌ی ۱ — بیلد فرانت‌اند
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS frontend-build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /build

# اول فقط فایل‌های وابستگی، تا لایه‌ی نصب کش شود
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# ---------------------------------------------------------------------------
# مرحله‌ی ۲ — وابستگی‌های ایجنت
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS agent-build

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# ابزارهای کامپایل برای پکیج‌هایی که افزونه‌ی بومی دارند
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY agent/pyproject.toml agent/uv.lock ./
RUN mkdir -p src
# --locked یعنی دقیقاً همان نسخه‌های uv.lock (بیلد بازتولیدپذیر)
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

# ---------------------------------------------------------------------------
# مرحله‌ی ۳ — رانتایم
# ---------------------------------------------------------------------------
#
# پایه همان ایمیج پایتونی است که venv با آن ساخته شد. اگر پایه را عوض کنید،
# venv به مفسری اشاره می‌کند که وجود ندارد و کانتینر با خطای مبهم بالا
# نمی‌آید. Node فقط به‌صورت یک باینری از ایمیج رسمی برداشته می‌شود، چون
# دبیان bookworm نسخه‌ی ۲۲ ندارد و `node:sqlite` از ۲۲.۵ آمده است.
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS runtime

COPY --from=node:${NODE_VERSION}-bookworm-slim /usr/local/bin/node /usr/local/bin/node

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# مسیر پیش‌فرض پایگاه داده روی دیسک ماندگار. اگر دیسک سوار نشود، فایل داخل
# کانتینر ساخته می‌شود و با هر استقرار تازه همه‌چیز پاک می‌شود.
ENV DATABASE_PATH=/app/data/ostandari.db

WORKDIR /app

# اسکیما و اسکریپت مهاجرت
COPY db/ ./db/

# فرانت‌اند: خروجی standalone + دارایی‌های ایستا (که standalone شاملشان نیست)
COPY --from=frontend-build /build/.next/standalone/ ./frontend/
COPY --from=frontend-build /build/.next/static/ ./frontend/.next/static/
COPY --from=frontend-build /build/public/ ./frontend/public/

# ایجنت: محیط مجازی و کد
COPY --from=agent-build /build/.venv/ ./agent/.venv/
COPY agent/src/ ./agent/src/

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# کاربر بدون دسترسی ویژه. دیسک باید برایش قابل نوشتن باشد.
ARG UID=10001
RUN adduser --disabled-password --gecos "" --home /app --shell /sbin/nologin --uid ${UID} appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

CMD ["/usr/local/bin/entrypoint.sh"]
