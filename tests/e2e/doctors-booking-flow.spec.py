"""
E2E: language filter on /doctors + reaching booking step on /book.

Run:
  python3 tests/e2e/doctors-booking-flow.spec.py

Requires the dev server to be running at http://localhost:8080.
Ignores pre-existing SSR hydration mismatches (Hijri date locale, doctor count).
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/doctor-flow"); OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        fatal = []
        page.on("pageerror", lambda e: (
            None if "Hydration failed" in str(e) else fatal.append(f"pageerror: {e}")
        ))

        # 1) Doctors page loads with cards
        await page.goto(f"{BASE}/doctors", wait_until="networkidle")
        await page.screenshot(path=str(OUT / "1_doctors.png"))
        base_count = await page.locator('a[href^="/doctors/"]').count()
        assert base_count > 0, "no doctor cards on /doctors"
        print(f"[ok] /doctors renders {base_count} doctor links")

        # 2) Language filter ?language=ar returns doctors
        await page.goto(f"{BASE}/doctors?language=ar", wait_until="networkidle")
        await page.screenshot(path=str(OUT / "2_filter_ar.png"))
        ar_count = await page.locator('a[href^="/doctors/"]').count()
        assert ar_count > 0, "language=ar filter returned no doctors"
        print(f"[ok] ?language=ar → {ar_count} doctors")

        # 3) Language filter ?language=ar,en (must speak both) returns doctors
        await page.goto(f"{BASE}/doctors?language=ar,en", wait_until="networkidle")
        both_count = await page.locator('a[href^="/doctors/"]').count()
        assert both_count > 0, "language=ar,en filter returned no doctors"
        print(f"[ok] ?language=ar,en → {both_count} doctors")

        # 4) Pick a real doctor slug from the list
        hrefs = await page.locator('a[href^="/doctors/"]').evaluate_all(
            "els => els.map(e => e.getAttribute('href'))"
        )
        slug_href = next(
            (h for h in hrefs if h and h != "/doctors" and not h.startswith("/doctors?")),
            None,
        )
        assert slug_href, "no doctor detail link found"
        slug = slug_href.split("/doctors/")[-1].split("?")[0]
        print(f"[ok] picked doctor slug: {slug}")

        # 5) /book?doctor=<slug> reaches booking flow
        await page.goto(f"{BASE}/book?doctor={slug}", wait_until="networkidle")
        await page.screenshot(path=str(OUT / "3_book.png"))
        assert "/book" in page.url, f"did not reach /book, got {page.url}"
        # The stepper mounts one of the step components; body should have visible content
        text = (await page.locator("body").inner_text()).strip()
        assert len(text) > 50, "book page appears empty"
        print(f"[ok] /book reached at {page.url}")

        assert not fatal, f"unexpected page errors: {fatal}"
        print("\nAll checks passed.")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
