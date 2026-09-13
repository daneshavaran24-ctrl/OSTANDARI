# وضعیت اولیه‌ی دمو را برمی‌گرداند: کاربر maxman123 دوباره مسدود می‌شود.
# بعد از هر بار اجرای سناریو این را اجرا کنید تا دمو قابل تکرار باشد.
#
# معادل ویندوزی reset-demo.sh — هر دو باید هم‌رفتار بمانند.
#
#   pwsh ./demo-app/reset-demo.ps1     یا     .\demo-app\reset-demo.ps1

$ErrorActionPreference = 'Stop'

$blockFile = Join-Path $PSScriptRoot 'public/blockusers.txt'

# با WriteAllText نوشته می‌شود تا بایت‌به‌بایت همان چیزی باشد که نسخه‌ی bash
# تولید می‌کند: بدون BOM و با پایان خط یونیکس. Set-Content روی ویندوز پیش‌فرض
# CRLF و گاهی BOM اضافه می‌کند. اپ دمو به هر حال trim() می‌زند و هر دو را تحمل
# می‌کند، ولی یکسان بودن خروجی دو اسکریپت ارزش خودش را دارد.
[System.IO.File]::WriteAllText($blockFile, "maxman123`n", [System.Text.UTF8Encoding]::new($false))

Write-Host "✓ کاربر maxman123 دوباره مسدود شد — دمو آماده‌ی اجرای مجدد است."
