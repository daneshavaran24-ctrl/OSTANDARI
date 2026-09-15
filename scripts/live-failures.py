#!/usr/bin/env python3
"""
چاپ علت شکست آزمون‌های زنده، از روی گزارش JSON پلی‌رایت.

⚠️ چرا این فایل وجود دارد: پیام واقعی شکست وسط حدود ۲۷۰۰ خط لاگ CI می‌نشیند و
رسیدن به آن چند بار رفت‌وبرگشت لازم داشت — در حالی که خودِ پیام یک خط بود.
این اسکریپت همان یک خط را به انتهای لاگ می‌آورد، جایی که اول نگاه می‌کنید.
"""

import json
import sys


def walk(suites: list[dict]) -> None:
    for suite in suites:
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                for run in test.get("results", []):
                    if run.get("status") in ("passed", "skipped"):
                        continue
                    message = (run.get("error") or {}).get("message", "")
                    print(f"✗ {spec.get('title')}")
                    for line in message.strip().splitlines()[:3]:
                        print(f"    {line}")
        walk(suite.get("suites", []))


def main() -> int:
    if len(sys.argv) < 2:
        print("مسیر گزارش JSON را بدهید.", file=sys.stderr)
        return 2

    with open(sys.argv[1], encoding="utf-8") as handle:
        report = json.load(handle)

    walk(report.get("suites", []))
    return 0


if __name__ == "__main__":
    sys.exit(main())
