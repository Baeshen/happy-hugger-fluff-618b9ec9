"""
E2E: the "never step=0" clamp must not break the success path.

Scenario:
  1. Walk the full wizard (service → branch → specialty → doctor → date →
     time → patient → review → confirm).
  2. Assert the success screen (step=9) renders with a booking reference.
  3. Assert the URL never contains `step=0` at any point.
  4. Assert `step` is NOT pushed as a query param on the success view — the
     wizard intentionally keeps step=9 out of the URL (it's only reachable
     via a real submit, never via a deep link).
  5. Reload the success page. Because the draft is cleared on submit, the
     wizard renders fresh at step=1 — still with no `step=0` and no crash.

Exits non-zero on failure.
"""
import asyncio, os, re, sys, traceback
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 1800}, locale="ar-SA",
        )
        page = await ctx.new_page()

        url_history: list[str] = []
        page.on("framenavigated", lambda f: url_history.append(f.url)
                if f is page.main_frame else None)

        errors = []
        def maybe(kind, val):
            if "/book" in page.url:
                errors.append(f"{kind}: {val}")
        page.on("pageerror", lambda e: maybe("pageerror", str(e)))
        page.on("console",
                lambda m: maybe("console.error", m.text) if m.type == "error" else None)

        try:
            # ---- Full wizard drive (mirrors tests/e2e/booking-flow.py) ----
            await page.goto(f"{BASE}/book", wait_until="domcontentloaded")
            # Dismiss the intro overlay if it appears (it intercepts clicks).
            try:
                await page.get_by_role(
                    "button", name=re.compile(r"تخطي|Skip")
                ).click(timeout=3000)
            except Exception:
                pass

            # Step 1 — service
            await page.wait_for_selector("text=اختر نوع الخدمة", timeout=10_000)
            await page.locator(
                "button", has_text=re.compile(r"عيادات تخصصية|Specialty Clinics")
            ).first.click()

            # Step 2 — branch
            await page.wait_for_selector("text=اختر الفرع", timeout=10_000)
            await page.locator("button.text-start.rounded-xl.border-2").first.click()

            # Step 3 — specialty
            await page.wait_for_selector("text=اختر التخصص", timeout=10_000)
            await page.locator("button.rounded-xl.border-2.p-4.text-center").first.click()

            # Step 4 — doctor
            await page.wait_for_selector("text=اختر الطبيب", timeout=10_000)
            doc = page.locator("button.text-start.rounded-xl.border-2:not([disabled])").first
            if await doc.count() == 0:
                raise AssertionError("no doctor available")
            await doc.click()


            # date + time picker with retry across days
            await page.wait_for_timeout(1200)
            picked = False
            for _ in range(7):
                days = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
                n = await days.count()
                if n == 0:
                    break
                for i in range(min(n, 7)):
                    await days.nth(i).click()
                    await page.wait_for_timeout(700)
                    slot = page.locator(
                        "div.grid.grid-cols-3 > button:not([disabled]), "
                        "div.grid.grid-cols-5 > button:not([disabled])"
                    ).first
                    if await slot.count() > 0:
                        await slot.click()
                        picked = True
                        break
                if picked:
                    break
            if not picked:
                raise AssertionError("no available date/time slot")
            await page.wait_for_timeout(400)

            await page.get_by_placeholder(
                re.compile("الاسم كما في الهوية|Full name")
            ).fill("محمد أحمد الاختبار")
            await page.get_by_placeholder("05XXXXXXXX").fill("0501234567")
            await page.locator("button", has_text=re.compile(r"^ذكر$|^Male$")).first.click()
            await page.get_by_role("button", name=re.compile("^التالي|^Next")).click()
            await page.wait_for_timeout(500)

            await page.get_by_role(
                "button", name=re.compile("تأكيد الحجز|Confirm booking")
            ).click()

            # ---- Success (step=9) ----
            await page.wait_for_selector(
                "text=/تم تأكيد حجزك|Your booking is confirmed/", timeout=25_000
            )
            success_url = page.url
            print("success url:", success_url)

            ref = page.locator(
                "span.text-2xl.font-mono, span.md\\:text-3xl.font-mono"
            ).first
            if await ref.count() == 0:
                raise AssertionError("success screen missing booking reference")
            print("reference:", (await ref.inner_text()).strip())

            # step=9 must NOT be pushed as a URL param (design), and step=0
            # must never appear at any point along the way.
            if "step=9" in success_url:
                raise AssertionError(f"step=9 leaked into URL: {success_url}")
            for u in url_history:
                if "step=0" in u:
                    raise AssertionError(f"step=0 appeared during flow: {u}")

            # ---- Reload after success ----
            await page.reload(wait_until="domcontentloaded")
            # Draft is cleared on submit → fresh wizard at step=1.
            await page.wait_for_selector("text=اختر نوع الخدمة", timeout=10_000)
            await page.wait_for_function(
                "window.location.search.includes('step=1')", timeout=10_000
            )
            reload_url = page.url
            print("after reload:", reload_url)
            if "step=0" in reload_url:
                raise AssertionError(f"reload leaked step=0: {reload_url}")

            real = [e for e in errors if "Failed to load resource" not in e]
            if real:
                print("errors:", real)
                raise AssertionError("unexpected errors on /book")

            print("\nSuccess path preserved, no step=0 anywhere. ✅")
        except Exception as exc:
            print("FAIL:", exc)
            traceback.print_exc()
            sys.exit(1)
        finally:
            await ctx.close()
            await browser.close()


asyncio.run(main())
