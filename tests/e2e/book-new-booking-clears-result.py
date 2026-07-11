"""
E2E: the "New booking" (حجز جديد) button on the success screen must:
  1. Remove `booking:result` from sessionStorage (also `booking:draft`).
  2. Reset the wizard to step=1 with a fresh URL (?step=1).
  3. After a subsequent page reload, the success screen must NOT reappear,
     and the URL must contain neither `step=0` nor `step=9`.

Avoids driving the full wizard: seeds sessionStorage directly with a
step=9 draft + result payload, which is exactly what a real submission
leaves behind (see StepSuccess + booking result persistence in book.tsx).

Exits non-zero on failure.
"""
import asyncio, json, os, re, sys, traceback
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")

DRAFT = {
    "step": 9,
    "serviceType": "clinic",
    "branchId": None,
    "specialtyId": None,
    "doctorId": None,
    "date": "2099-01-15",
    "time": "10:00",
    "patient": {
        "name": "محمد أحمد الاختبار",
        "phone": "0501234567",
        "nationalId": "",
        "gender": "male",
        "reason": "",
        "reminder24h": True,
        "reminder2h": True,
    },
}
RESULT = {"reference": "TST-123456", "phone": "0501234567"}


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 1800}, locale="ar-SA",
        )
        page = await ctx.new_page()

        try:
            # 1. Seed sessionStorage with a fake successful booking.
            await page.goto(f"{BASE}/book", wait_until="domcontentloaded")
            try:
                await page.get_by_role(
                    "button", name=re.compile(r"تخطي|Skip")
                ).click(timeout=3000)
            except Exception:
                pass
            await page.evaluate(
                "([d, r]) => { sessionStorage.setItem('booking:draft', d);"
                "               sessionStorage.setItem('booking:result', r); }",
                [json.dumps(DRAFT), json.dumps(RESULT)],
            )
            await page.reload(wait_until="domcontentloaded")
            try:
                await page.get_by_role(
                    "button", name=re.compile(r"تخطي|Skip")
                ).click(timeout=3000)
            except Exception:
                pass

            # Success screen must render.
            await page.wait_for_selector(
                "text=/تم تأكيد حجزك|Your booking is confirmed/", timeout=15_000
            )
            print("seeded success screen at:", page.url)

            # 2. Click "حجز جديد" (New booking).
            await page.get_by_role(
                "button", name=re.compile("حجز جديد|New booking")
            ).click()

            # Wizard resets to step=1.
            await page.wait_for_selector("text=اختر نوع الخدمة", timeout=10_000)
            await page.wait_for_function(
                "window.location.search.includes('step=1')", timeout=10_000
            )
            after_reset = page.url
            print("after reset:", after_reset)
            if "step=0" in after_reset:
                raise AssertionError(f"reset leaked step=0: {after_reset}")
            if "step=9" in after_reset:
                raise AssertionError(f"reset leaked step=9: {after_reset}")

            # sessionStorage must be cleared for both keys.
            storage = await page.evaluate(
                "() => ({ draft: sessionStorage.getItem('booking:draft'),"
                "         result: sessionStorage.getItem('booking:result') })"
            )
            print("sessionStorage after reset:", storage)
            if storage["result"] is not None:
                raise AssertionError(f"booking:result not cleared: {storage['result']!r}")
            if storage["draft"] is not None:
                raise AssertionError(f"booking:draft not cleared: {storage['draft']!r}")

            # 3. Reload — success screen must NOT reappear, no step=0/9.
            await page.reload(wait_until="domcontentloaded")
            try:
                await page.get_by_role(
                    "button", name=re.compile(r"تخطي|Skip")
                ).click(timeout=3000)
            except Exception:
                pass
            await page.wait_for_selector("text=اختر نوع الخدمة", timeout=10_000)
            reload_url = page.url
            print("after reload:", reload_url)
            if "step=0" in reload_url:
                raise AssertionError(f"reload leaked step=0: {reload_url}")
            if "step=9" in reload_url:
                raise AssertionError(f"reload leaked step=9: {reload_url}")

            success_visible = await page.locator(
                "text=/تم تأكيد حجزك|Your booking is confirmed/"
            ).count()
            if success_visible:
                raise AssertionError("success screen reappeared after reset+reload")

            print("\n\"حجز جديد\" clears result & reload stays fresh. ✅")
        except Exception as exc:
            print("FAIL:", exc)
            traceback.print_exc()
            sys.exit(1)
        finally:
            await ctx.close()
            await browser.close()


asyncio.run(main())
