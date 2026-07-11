"""
E2E: clicking the "احجز موعد" link from a doctor card on /doctors must land on
/book with step=5 in the URL — never step=0, never a URL missing `step`.

This exercises the real Link produced by DoctorCard.tsx (doctor + specialty +
single-branch fills in `?doctor=&specialty=&branch=`).

Exits non-zero on failure.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors = []
        def maybe(kind, val):
            if "/book" in page.url:
                errors.append(f"{kind}: {val}")
        page.on("pageerror", lambda e: maybe("pageerror", str(e)))
        page.on("console", lambda m: maybe("console.error", m.text) if m.type == "error" else None)

        await page.goto(f"{BASE}/doctors", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")

        # Find any doctor card whose Book link goes to /book?... with at least
        # doctor+specialty (branch may or may not be single).
        link = page.locator(
            'a[href^="/book?"][href*="doctor="][href*="specialty="]'
        ).first
        await link.wait_for(timeout=10_000)
        href = await link.get_attribute("href")
        print("clicking book link:", href)

        await link.click()
        await page.wait_for_function(
            "window.location.pathname === '/book'", timeout=5_000
        )
        # Wait until wizard resolves the URL to step=5 (date step).
        await page.wait_for_function(
            "window.location.search.includes('step=5')", timeout=10_000
        )
        await page.wait_for_selector("text=اختر التاريخ", timeout=10_000)

        url = page.url
        print("landed:", url)
        if "step=0" in url:
            raise AssertionError(f"regressed to step=0: {url}")
        if "step=5" not in url:
            raise AssertionError(f"missing step=5: {url}")
        for k in ("doctor=", "specialty="):
            if k not in url:
                raise AssertionError(f"missing {k} in {url}")

        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("errors:", real)
            raise AssertionError("unexpected errors on /book")

        print("\nBook link from /doctors lands at step=5. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
