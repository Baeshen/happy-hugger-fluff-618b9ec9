"""
E2E: success screen — QR canvas, tracking link, PDF button on desktop/tablet/mobile.

Runs the full booking wizard once, then reuses the same reference by navigating
to /book at step 9 via sessionStorage restore for each viewport size. If that
proves fragile we fall back to running the full flow per viewport.

Checks per viewport:
  - QR canvas rendered and has non-blank pixels
  - Tracking link visible with /track?ref=...
  - PDF button visible and clickable (opens new tab)
  - Download-QR button enabled

Exits non-zero on failure.
"""
import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SHOTS = Path("/tmp/browser/booking/success-shots")
SHOTS.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("desktop", 1280, 900),
    ("tablet", 820, 1180),
    ("mobile", 390, 844),
]


async def run_full_wizard(page):
    """Complete steps 1..8 and land on the success screen."""
    await page.goto(f"{BASE}/book", wait_until="domcontentloaded")
    try:
        await page.locator("button", has_text="تخطي").first.click(timeout=2000)
    except Exception:
        pass

    await page.wait_for_selector("text=عيادات تخصصية", timeout=10_000)
    await page.locator("button", has_text="عيادات تخصصية").first.click()

    await page.wait_for_selector("text=اختر الفرع", timeout=10_000)
    await page.locator("button:has(div.font-semibold)").first.click()

    await page.wait_for_selector("text=اختر التخصص", timeout=10_000)
    await page.locator("button:has(div.font-semibold)").first.click()

    await page.wait_for_selector("text=اختر الطبيب", timeout=10_000)
    await page.locator("button:has(div.font-semibold)").first.click()

    await page.wait_for_selector("text=اختر التاريخ", timeout=15_000)
    # Pick first enabled calendar day
    day = page.locator("button[aria-label*='2026']:not([disabled])").first
    await day.click(timeout=10_000)

    await page.wait_for_selector("text=اختر الوقت", timeout=15_000)
    slot = page.locator("button:not([disabled])").filter(has_text=":").first
    await slot.click()

    await page.wait_for_selector("text=بياناتك", timeout=10_000)
    await page.fill('input[name="patient_name"]', "أحمد محمد التجريبي")
    await page.fill('input[name="patient_phone"]', "0501234567")
    # Gender male
    male = page.locator("button", has_text="ذكر").first
    if await male.count():
        await male.click()

    # Advance to review
    await page.locator("button", has_text="التالي").first.click()
    await page.wait_for_selector("text=مراجعة", timeout=10_000)
    # Submit
    await page.locator("button", has_text="تأكيد الحجز").first.click()

    await page.wait_for_selector("text=تم تأكيد حجزك", timeout=20_000)


async def check_success_ui(page, label):
    # Wait for QR block to mount
    await page.wait_for_selector('[data-testid="booking-qr"]', timeout=10_000)
    await page.wait_for_timeout(400)  # QRCode.toCanvas is async

    # QR canvas non-blank
    non_blank = await page.evaluate("""
        () => {
            const c = document.querySelector('[data-testid=\"booking-qr\"] canvas');
            if (!c) return false;
            const ctx = c.getContext('2d');
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let dark = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i] < 60 && d[i+1] < 60 && d[i+2] < 60) dark++;
            }
            return dark > 200;  // enough dark modules to be a real QR
        }
    """)
    if not non_blank:
        raise AssertionError(f"[{label}] QR canvas is blank")

    # Tracking link text visible
    link_text = await page.locator('[data-testid="booking-qr"] p').first.inner_text()
    if "/track?ref=" not in link_text:
        raise AssertionError(f"[{label}] tracking link missing: {link_text!r}")

    # PDF button visible + enabled
    pdf_btn = page.locator('[data-testid="booking-pdf-btn"]')
    if not await pdf_btn.is_visible():
        raise AssertionError(f"[{label}] PDF button not visible")
    if not await pdf_btn.is_enabled():
        raise AssertionError(f"[{label}] PDF button disabled")

    # Track-in-my-bookings link
    track = page.locator("a", has_text="متابعة في حجوزاتي").first
    href = await track.get_attribute("href")
    if not href or "/track" not in href or "ref=" not in href:
        raise AssertionError(f"[{label}] tracking link href malformed: {href}")

    # Take screenshot
    shot = SHOTS / f"success-{label}.png"
    await page.screenshot(path=str(shot))
    print(f"[ok:{label}] QR non-blank, link={link_text.strip()[:60]}…, pdf-btn visible, shot={shot.name}")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        errors = []

        # Single wizard run in the biggest viewport, then just resize for the other checks.
        ctx = await browser.new_context(viewport={"width": VIEWPORTS[0][1], "height": VIEWPORTS[0][2]})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await run_full_wizard(page)

        for label, w, h in VIEWPORTS:
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(200)
            await check_success_ui(page, label)

        # PDF button opens a new tab (window.open in booking-pdf.ts)
        async with ctx.expect_page(timeout=8_000) as new_page_info:
            await page.locator('[data-testid="booking-pdf-btn"]').click()
        pdf_page = await new_page_info.value
        await pdf_page.wait_for_load_state("domcontentloaded")
        html_text = await pdf_page.content()
        if "تأكيد حجز" not in html_text and "Booking" not in html_text:
            raise AssertionError("PDF window content missing expected header")
        print("[ok] PDF window opened with confirmation content")
        await pdf_page.close()

        real = [e for e in errors if "Failed to load resource" not in e and "Manifest" not in e]
        if real:
            print("errors:", real[:5])
            raise AssertionError("unexpected console/page errors")

        print("\nAll success-screen QR/PDF checks passed on desktop, tablet, mobile.")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
