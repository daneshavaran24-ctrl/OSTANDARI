# مشارکت در پروژه

## پیش از هر تغییری

اگر روی بخش ایجنت کار می‌کنید، **اول [`agent/AGENTS.md`](agent/AGENTS.md) را
بخوانید.** چیزهایی را مستند می‌کند که از خواندن کد قابل حدس نیستند: چرا ترتیب
راه‌اندازی آواتار و صدای پس‌زمینه اهمیت دارد، و اینکه `participant.kind` یک عدد
است نه رشته.

اگر تغییرتان به ورودی کاربر یا مدل دست می‌زند، [`SECURITY.md`](SECURITY.md) را
هم بخوانید.

## راه‌اندازی

```bash
cp .env.example agent/.env.local
cp .env.example frontend/.env.local

cd agent     && uv sync
cd frontend  && pnpm install
cd demo-app  && npm ci --legacy-peer-deps
npm install                     # برای Playwright در ریشه
```

## پیش از ارسال PR

همان چیزی را اجرا کنید که CI اجرا می‌کند:

```bash
cd agent     && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest -q
cd frontend  && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
cd demo-app  && npm run lint && npm run typecheck && npm test && npm run build
npx playwright test
```

برای ایجنت، `task check` همه‌ی بررسی‌های پایتون را با هم اجرا می‌کند.

## قواعدی که رعایتشان مهم است

**تستی که خطا را نگیرد بی‌ارزش است.** وقتی تستی نوشتید، عمداً کد را خراب کنید و
ببینید واقعاً می‌شکند. در همین پروژه چند بار همین کار نشان داد تستی که نوشته
شده بود چیزی را که ادعا می‌کرد نمی‌سنجید.

**ورودی مدل، ورودی کاربر است.** آرگومان‌های ابزارهای ایجنت را یک مدل زبانی
تولید می‌کند و کاربر در گفت‌وگو دیکته می‌کند. همان‌قدر اعتبارسنجی لازم دارند که
ورودی یک API عمومی. اعتبارسنجی‌ها در `agent/src/guards.py` جمع شده‌اند.

**منطق قابل تست را از سیم‌کشی جدا کنید.** `agent/src/agent.py` فقط نشست LiveKit
را می‌بندد و بدون اتاق واقعی اجرا نمی‌شود؛ منطق در `guards.py`، `audio.py` و
`tools.py` است. همین الگو در فرانت‌اند هم برقرار است — `isTokenExpired` و
`parsePayload` عمداً export شده‌اند.

**پوشش تست ایجنت زیر ۸۰٪ نرود.** `pytest` خودش با این آستانه شکست می‌خورد.

**مستنداتی که دروغ بگوید بدتر از نبودنش است.** اگر رفتاری را عوض کردید، README،
`AGENTS.md` و `SECURITY.md` را هم به‌روز کنید.

## سبک کد

- پایتون: `ruff` برای لینت و قالب‌بندی، `mypy` در حالت strict
- تایپ‌اسکریپت: ESLint و Prettier؛ هر دو پروژه `tsc --noEmit` هم دارند
- کامنت‌ها و پیام‌های کاربر به فارسی‌اند، چون کل محصول فارسی است

## نسخه‌ها

`livekit-agents` عمداً روی خط ۱.۸.x پین است. دلیلش در `agent/AGENTS.md` آمده؛
ارتقای major یک تصمیم مستقل است، نه اثر جانبی به‌روزرسانی وابستگی‌ها.
