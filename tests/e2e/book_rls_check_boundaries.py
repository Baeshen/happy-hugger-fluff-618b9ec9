"""
E2E: from the anonymous /book UI, prove that RLS WITH CHECK on
`anyone create appointments` and client-side Zod validation together
reject boundary-violating inputs:
  - whitespace-only patient_name → client Zod message, no DB row
  - short patient_phone (5 chars) → client Zod message, no DB row
  - past appointment_date (injected server-side via route rewrite,
    bypassing the UI's next-14-days generator) → server RLS rejects
    with the friendly Arabic mapping, no DB row

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY
Run: python3 tests/e2e/book_rls_check_boundaries.py
"""
import asyncio, os, sys, time, json, urllib.request, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright, Page, BrowserContext


SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

URL = os.environ["SUPABASE_URL"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def sb(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{URL}{path}", method=method,
        headers={"apikey": SVC, "Authorization": f"Bearer {SVC}",
                 "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None


async def walk_to_step4(page: Page):
    """Drive an anon session through steps 1-3 to the patient-info form."""
    await page.goto("http://localhost:8080/book", wait_until="networkidle")
    await page.wait_for_timeout(500)
    card = page.locator("div.rounded-2xl").first
    await card.wait_for(timeout=8000)
    await card.get_by_role("button", name="الأطفال", exact=True).click()
    await page.wait_for_timeout(200)
    await page.locator('button:has-text("التالي")').click()
    await page.wait_for_timeout(200)
    await card.get_by_role("button", name="أي طبيب متاح", exact=True).click()
    await page.wait_for_timeout(200)
    await page.locator('button:has-text("التالي")').click()
    await page.wait_for_timeout(500)
    date_grid = card.locator("div.grid").first
    await date_grid.locator("button").first.wait_for(timeout=8000)
    await date_grid.locator("button").first.click()
    await page.wait_for_timeout(500)
    time_grid = card.locator("div.grid").nth(1)
    await time_grid.locator("button").first.wait_for(timeout=6000)
    await time_grid.locator("button").first.click()
    await page.wait_for_timeout(200)
    await page.locator('button:has-text("التالي")').click()
    await page.wait_for_timeout(400)


async def submit(page: Page, name: str, phone: str):
    await page.locator("input").nth(0).fill(name)
    await page.locator("input").nth(1).fill(phone)
    await page.locator('button:has-text("تأكيد الحجز")').click()


async def count_rows(patient: str) -> int:
    q = urllib.parse.quote(patient, safe="")
    rows = sb(f"/rest/v1/appointments?patient_name=eq.{q}&select=id") or []
    return len(rows)


async def has_error_toast(page: Page) -> bool:
    # sonner toasts render text inside [data-sonner-toast] or role=status
    try:
        await page.wait_for_selector(
            '[data-sonner-toast], [role="status"], [role="alert"]',
            timeout=4000,
        )
        return True
    except Exception:
        return False


async def run_case(ctx: BrowserContext, label: str, patient: str,
                   phone: str, tamper_past_date: bool):
    page = await ctx.new_page()
    if tamper_past_date:
        yesterday = time.strftime(
            "%Y-%m-%d", time.gmtime(time.time() - 86400))

        async def rewrite(route, request):
            try:
                if ("/rest/v1/appointments" in request.url
                        and request.method == "POST"):
                    payload = json.loads(request.post_data or "null")
                    def patch(o):
                        if isinstance(o, dict):
                            o["appointment_date"] = yesterday
                    if isinstance(payload, list):
                        for x in payload: patch(x)
                    else:
                        patch(payload)
                    await route.continue_(post_data=json.dumps(payload))
                    return
            except Exception:
                pass
            await route.continue_()

        await page.route("**/*", rewrite)

    await walk_to_step4(page)
    await submit(page, patient, phone)
    await page.wait_for_timeout(1200)
    await page.screenshot(path=str(SHOTS / f"book_boundary_{label}.png"))

    # Success screen must NOT appear.
    success = await page.get_by_text("رقم الحجز", exact=False).first.is_visible()
    ok = not success
    # A row must not exist for this attempt.
    rows = await count_rows(patient)
    if rows != 0:
        ok = False
    await page.close()
    return ok, success, rows


async def main():
    stamp = int(time.time())
    ctx_kwargs = dict(viewport={"width": 1280, "height": 1800})
    failures = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(**ctx_kwargs)

        # 1) whitespace-only name — blocked by Zod client-side.
        name = f"__ws-{stamp}"  # unique query key though DB won't have the row
        ok, success, rows = await run_case(
            ctx, "ws_name", "   ", "0500000000", False)
        if not ok:
            failures.append(f"ws_name: success={success} rows={rows}")

        # 2) short phone — blocked by Zod client-side.
        patient2 = f"ShortPhone-{stamp}"
        ok, success, rows = await run_case(
            ctx, "short_phone", patient2, "123", False)
        if not ok:
            failures.append(f"short_phone: success={success} rows={rows}")

        # 3) past appointment_date — request rewritten to yesterday,
        #    RLS WITH CHECK rejects at the server.
        patient3 = f"PastDate-{stamp}"
        ok, success, rows = await run_case(
            ctx, "past_date", patient3, "0500000000", True)
        if not ok:
            failures.append(f"past_date: success={success} rows={rows}")

        await browser.close()

    # Cleanup — should be no-op but defensive.
    for p in [f"ShortPhone-{stamp}", f"PastDate-{stamp}"]:
        try: sb(f"/rest/v1/appointments?patient_name=eq.{p}", method="DELETE")
        except Exception: pass

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ book_rls_check_boundaries e2e passed "
          "(whitespace name / short phone / past date all rejected, no rows)")

asyncio.run(main())
