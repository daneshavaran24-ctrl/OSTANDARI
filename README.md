# دستیار هوشمند پشتیبانی استانداری

دستیار پشتیبانی فنی صوتی با آواتار تصویری. کاربر با دستیار حرف می‌زند، صفحه‌ی
نمایشش را به اشتراک می‌گذارد، و دستیار مشکل را می‌بیند، راهنمایی می‌کند، در صورت
لزوم مسدودیت حسابش را برمی‌دارد و خلاصه‌ی تیکت را برایش ایمیل می‌کند.

کل گفت‌وگو فارسی است.

## معماری

```
┌──────────────┐   صدا/تصویر/اشتراک صفحه   ┌──────────────┐
│  frontend/   │◄─────────────────────────►│  اتاق        │
│  Next.js 15  │                           │  LiveKit     │
└──────┬───────┘                           └──────┬───────┘
       │                                          │
       │  RPC: client.showNotification            │ صدا + ابزارها
       │  (اعلان بصری روی صفحه‌ی کاربر)           │
       │                                          ▼
       │                                   ┌──────────────┐
       │                                   │   agent/     │
       └───────────────────────────────────┤   Python     │
                                           │  + آواتار    │
                                           │Beyond Presence│
                                           └──────┬───────┘
                                                  │ پاک کردن فایل
                                                  ▼
                                           ┌──────────────┐
                                           │  demo-app/   │
                                           │ blockusers.  │
                                           │     txt      │
                                           └──────────────┘
```

| پوشه | چیست |
|---|---|
| `frontend/` | رابط کاربری گفت‌وگو (Next.js 15، React 19). توکن‌سرور LiveKit را هم خودش دارد. |
| `agent/` | ایجنت صوتی (`livekit-agents` + مدل Realtime اوپن‌ای‌آی + آواتار Beyond Presence) و دو ابزار `unblock_user` و `send_email`. چیدمانش از قالب رسمی [`agent-starter-python`](https://github.com/livekit-examples/agent-starter-python) پیروی می‌کند؛ جزئیات در [`agent/AGENTS.md`](agent/AGENTS.md). |
| `demo-app/` | اپ دموی «سامانه‌ی داخلی استانداری» (Vite + React). عمداً یک مشکل ورود دارد تا سناریوی پشتیبانی قابل نمایش باشد. |

## راه‌اندازی

### ۱. متغیرهای محیطی

```bash
cp .env.example agent/.env.local
cp .env.example frontend/.env.local
```

بعد هر دو فایل را پر کنید. کلیدهای لازم:

| کلید | از کجا | برای کدام بخش |
|---|---|---|
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` | داشبورد [LiveKit Cloud](https://cloud.livekit.io) | هر دو |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | `agent/` |
| `BEY_API_KEY` / `BEY_AVATAR_ID` | [Beyond Presence](https://bey.dev) | `agent/` |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | [رمز اپلیکیشن گوگل](https://myaccount.google.com/apppasswords) | `agent/` |

`GMAIL_APP_PASSWORD` باید «رمز اپلیکیشن» باشد، نه رمز اصلی حساب گوگل.

### ۲. اجرای هر سه بخش

هر کدام در یک ترمینال جدا:

```bash
# اپ دمو  →  http://localhost:8080
cd demo-app && npm install && npm run dev

# ایجنت
cd agent && uv sync && uv run src/agent.py dev

# رابط کاربری  →  http://localhost:3000
cd frontend && pnpm install && pnpm dev
```

## سناریوی دمو

۱. در `http://localhost:8080` با این اطلاعات وارد شوید:

   | | |
   |---|---|
   | نام کاربری | `\vienna\maxman123` |
   | رمز عبور | `passw0rd` |

   پیام «حساب کاربری شما مسدود شده است» را می‌بینید.

۲. در `http://localhost:3000` روی **شروع گفت‌وگو** بزنید. آواتار به فارسی سلام می‌کند.

۳. بگویید نمی‌توانید وارد سامانه شوید. دستیار از شما می‌خواهد صفحه‌ی نمایش را به
   اشتراک بگذارید؛ پنجره‌ی اپ دمو را انتخاب کنید.

۴. دستیار پیام مسدودیت را می‌بیند، ابزار `unblock_user` را صدا می‌زند، و یک اعلان
   سبز روی صفحه ظاهر می‌شود. حالا ورود موفق است.

۵. نشانی ایمیلتان را بدهید تا خلاصه‌ی تیکت را بفرستد؛ اعلان آبی دوم ظاهر می‌شود.

برای اجرای دوباره‌ی سناریو، کاربر را دوباره مسدود کنید:

```bash
./demo-app/reset-demo.sh
```

## نکته‌های مهم

- **ابزار رفع مسدودیت در کانتینر کار نمی‌کند.** بستر ساخت ایمیج داکر `agent/`
  است و `demo-app/public/blockusers.txt` بیرون آن قرار دارد، پس در کانتینر ابزار
  پیام «فایل پیدا نشد» برمی‌گرداند (کرش نمی‌کند). این محدودیت طبیعی است: ایمیج
  برای استقرار ایجنت روی LiveKit Cloud است و اپ دمو یک ابزار نمایش محلی. اگر لازم
  شد، مسیر را با `BLOCK_USERS_FILE` تنظیم کنید.
- **اپ دمو باید با `npm run dev` اجرا شود، نه `npm run build`.** ایجنت مسدودیت را
  با پاک کردن `demo-app/public/blockusers.txt` روی دیسک برمی‌دارد. در حالت
  توسعه، Vite این فایل را مستقیم از دیسک سرو می‌کند و تغییر بلافاصله دیده
  می‌شود؛ ولی در بیلد پروداکشن، `public/` در زمان بیلد به `dist/` کپی شده و
  نوشتن روی فایل مبدأ دیگر اثری ندارد. اگر مسیر دیگری لازم دارید، متغیر
  `BLOCK_USERS_FILE` را تنظیم کنید.
- **اطلاعات ورود اپ دمو عمداً هاردکد شده‌اند** (`demo-app/src/pages/Login.tsx`).
  این اپ فقط نقش «نرم‌افزار دارای مشکل» را بازی می‌کند و هیچ احراز هویت واقعی
  ندارد. هرگز این الگو را در سامانه‌ی واقعی استفاده نکنید.
- **قالب نام کاربری** (`\دامنه\نام‌کاربری`) هسته‌ی سناریوی آموزشی است. فیلدهای
  ورود عمداً `dir="ltr"` هستند تا بک‌اسلش‌ها در محیط راست‌به‌چپ به‌هم نریزند.
- **صدای دستیار** با `OPENAI_VOICE` قابل تغییر است (پیش‌فرض: `coral`).

## توسعه

```bash
cd frontend && pnpm lint && pnpm format:check && pnpm build
cd demo-app && npm run lint && npm run build
cd agent   && uv run ruff check && uv run ruff format --check && uv run pytest -q
```

همین‌ها در CI هم اجرا می‌شوند (`.github/workflows/build-and-test.yaml`).

برای ایجنت، `taskfile.yaml` هم میان‌برهای آماده دارد:

| دستور | کار |
|---|---|
| `task install` | نصب وابستگی‌ها |
| `task dev` | اجرای ایجنت در حالت توسعه |
| `task console` | گفت‌وگو با ایجنت در ترمینال، بدون فرانت‌اند |
| `task check` | لینت، قالب‌بندی و تست‌ها |
| `task simulate` | اجرای سناریوهای گفت‌وگو (نیازمند LiveKit CLI) |

### تست ایجنت

تست‌های `agent/tests/test_agent.py` منطق ابزارها را می‌سنجند و هیچ کلید یا شبکه‌ای
لازم ندارند. رفتار گفت‌وگویی در `agent/scenarios.yaml` پوشش داده می‌شود و برای
اجرایش به [LiveKit CLI](https://docs.livekit.io/intro/basics/cli/) نسخه ۲.۱۵+ و
کلیدهای معتبر نیاز دارید:

```bash
cd agent && lk agent simulate --scenarios scenarios.yaml
```

### استقرار

```bash
cd agent && docker build -t ostandari-agent . && lk agent deploy
```

`agent/.dockerignore` فایل‌های `.env*` را کنار می‌گذارد، پس هیچ کلیدی وارد ایمیج
نمی‌شود. **توجه:** در کانتینر، ابزار `unblock_user` کار نمی‌کند چون `demo-app/`
بیرون بستر ساخت ایمیج است — به بخش «نکته‌های مهم» پایین نگاه کنید.

## لایسنس

این پروژه از دو پروژه‌ی بالادستی مشتق شده است. متن لایسنس‌ها در `docs/`:

- `docs/LICENSE-frontend-upstream` — قالب `livekit/agent-starter-react`
- `docs/LICENSE-agent-upstream` — پروژه‌ی اصلی ایجنت (© 2025 Thanh-Y Nguyen)
- `docs/LICENSE-LIVEKIT` — اجزای LiveKit

بخش‌های مشتق‌شده از پروژه‌ی ایجنت برای استفاده‌ی خصوصی و آموزشی مجازند؛ بازنشر یا
استفاده‌ی تجاری نیازمند اجازه‌ی کتبی است. پیش از هر استفاده‌ی عمومی، `docs/` را
بخوانید.
