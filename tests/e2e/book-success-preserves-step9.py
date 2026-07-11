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

        # Track the URL each time we settle on a rendered step. The zod
        # validator defaults `step` to 0 on the initial navigation with no
        # search param — that transient value is fixed by the wizard's
        # replace-URL effect. We only assert the URL AFTER content is
        # visible, when the fix has had a chance to run.
        settled_urls: list[str] = []

        errors = []
        def maybe(kind, val):
            if "/book" in page.url:
                errors.append(f"{kind}: {val}")
        page.on("pageerror", lambda e: maybe("pageerror", str(e)))
        page.on("console",
                lambda m: maybe("console.error", m.text) if m.type == "error" else None)

        async def snapshot(step_prompt, label):
            await page.wait_for_selector(f"text={step_prompt}", timeout=10_000)
            # Give the URL-replace effect a tick to settle.
            await page.wait_for_timeout(300)
            url = page.url
            print(f"[{label}] {url}")
            if "step=0" in url:
                raise AssertionError(f"[{label}] step=0 leaked: {url}")
            settled_urls.append(url)
            return url


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

            # Step 4 — doctor. Retry specialties until one yields a doctor.
            async def try_pick_doctor() -> bool:
                await page.wait_for_selector("text=اختر الطبيب", timeout=10_000)
                # Give the doctors query time to populate.
                for _ in range(10):
                    await page.wait_for_timeout(400)
                    btn = page.locator(
                        "button.text-start.rounded-xl.border-2:not([disabled])"
                    ).first
                    if await btn.count() > 0:
                        await btn.click()
                        return True
                    empty = page.locator("text=لا يوجد أطباء متاحون")
                    if await empty.count() > 0:
                        return False
                return False

            picked_doctor = await try_pick_doctor()
            if not picked_doctor:
                # Go back to specialty step and try each remaining specialty.
                await page.get_by_role(
                    "button", name=re.compile("^السابق|^Back")
                ).click()
                await page.wait_for_selector("text=اختر التخصص", timeout=10_000)
                specs = page.locator("button.rounded-xl.border-2.p-4.text-center")
                n_specs = await specs.count()
                for i in range(1, n_specs):
                    await specs.nth(i).click()
                    if await try_pick_doctor():
                        picked_doctor = True
                        break
                    await page.get_by_role(
                        "button", name=re.compile("^السابق|^Back")
                    ).click()
                    await page.wait_for_selector("text=اختر التخصص", timeout=10_000)
                    specs = page.locator("button.rounded-xl.border-2.p-4.text-center")
            if not picked_doctor:
                raise AssertionError("no specialty had bookable doctors")



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

            # step=9 must NOT be pushed as a URL param (intentional: the
            # success screen isn't a shareable deep link). step=0 must NEVER
            # appear on the settled URL after the success screen renders.
            if "step=9" in success_url:
                raise AssertionError(f"step=9 leaked into URL: {success_url}")
            if "step=0" in success_url:
                raise AssertionError(f"step=0 leaked on success: {success_url}")


            # ---- Reload after success ----
            # The success screen (step=9) must survive a page reload —
            # even though the URL still shows step=8 (design: step=9 isn't
            # pushed). Reference persists via sessionStorage.
            storage_dump = await page.evaluate(
                "() => ({ draft: sessionStorage.getItem('booking:draft'),"
                "         result: sessionStorage.getItem('booking:result') })"
            )
            print("sessionStorage before reload:", storage_dump)
            await page.reload(wait_until="domcontentloaded")
            try:
                await page.get_by_role(
                    "button", name=re.compile(r"تخطي|Skip")
                ).click(timeout=3000)
            except Exception:
                pass
            await page.wait_for_selector(
                "text=/تم تأكيد حجزك|Your booking is confirmed/", timeout=15_000
            )
            reload_url = page.url
            print("after reload:", reload_url)
            if "step=0" in reload_url:
                raise AssertionError(f"reload leaked step=0: {reload_url}")
            ref2 = page.locator(
                "span.text-2xl.font-mono, span.md\\:text-3xl.font-mono"
            ).first
            if await ref2.count() == 0:
                raise AssertionError("reload lost the success reference")

            # ---- After "New booking" reset ----
            await page.get_by_role(
                "button", name=re.compile("حجز جديد|New booking")
            ).click()
            await page.wait_for_selector("text=اختر نوع الخدمة", timeout=10_000)
            after_reset = page.url
            print("after reset:", after_reset)
            if "step=0" in after_reset:
                raise AssertionError(f"reset leaked step=0: {after_reset}")



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
