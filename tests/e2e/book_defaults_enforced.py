"""
E2E: from the anonymous /book UI, complete a real booking and prove the DB
trigger `trg_force_appointment_defaults` sanitizes the row — even when the
outgoing insert body is tampered to inject `status: 'confirmed'` and a
non-null `notes` value. The row that lands must have `status='new'` and
`notes=NULL`, and no `appointment_audit` row must exist for it.

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/book_defaults_enforced.py
"""
import asyncio, os, sys, time, json, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

URL = os.environ["SUPABASE_URL"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

def sb(path, method="POST", body=None):
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

INJECT_STATUS = "confirmed"
INJECT_NOTES = "leaked private note by attacker"

async def main():
    stamp = int(time.time())
    patient = f"BookDefaults-{stamp}"
    failures = []
    inserted_id = None

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # Rewrite the outgoing anon insert body to inject status + notes.
        async def rewrite(route, request):
            try:
                if "/rest/v1/appointments" in request.url and request.method == "POST":
                    body = request.post_data or ""
                    parsed = json.loads(body) if body else None
                    def inject(obj):
                        if isinstance(obj, dict):
                            obj["status"] = INJECT_STATUS
                            obj["notes"] = INJECT_NOTES
                    if isinstance(parsed, list):
                        for x in parsed: inject(x)
                    else:
                        inject(parsed)
                    await route.continue_(post_data=json.dumps(parsed))
                    return
            except Exception:
                pass
            await route.continue_()

        await page.route("**/*", rewrite)

        try:
            await page.goto("http://localhost:8080/book", wait_until="networkidle")
            await page.wait_for_timeout(600)
            await page.screenshot(path=str(SHOTS / "book_step1.png"))

            # Step 1: pick a specific specialty by Arabic name.
            card = page.locator("div.rounded-2xl").first
            await card.wait_for(timeout=8000)
            await card.get_by_role("button", name="الأطفال", exact=True).click()
            next_btn = page.get_by_role("button", name="التالي")
            await next_btn.wait_for(state="visible", timeout=5000)
            await next_btn.click()

            # Step 2: "any available doctor"
            await page.wait_for_timeout(300)
            await card.get_by_role("button", name="أي طبيب متاح", exact=True).click()
            await next_btn.click()

            # Step 3: date grid, then time grid.
            await page.wait_for_timeout(600)
            await page.screenshot(path=str(SHOTS / "book_step3.png"))
            date_btn = page.locator("div.grid button").first
            await date_btn.wait_for(timeout=8000)
            await date_btn.click()
            await page.wait_for_timeout(500)
            # After a date is picked, a second grid (times) appears.
            time_btn = page.locator("div.grid").nth(1).locator("button").first
            await time_btn.wait_for(timeout=6000)
            await time_btn.click()
            await page.get_by_role("button", name="التالي").click()

            # Step 4: patient info + submit.
            await page.wait_for_timeout(400)
            await page.screenshot(path=str(SHOTS / "book_step4.png"))
            await page.locator("input").nth(0).fill(patient)
            await page.locator("input").nth(1).fill("0501234567")
            await page.get_by_role("button", name="تأكيد الحجز").click()

            # Wait for success screen (booking_success translation).
            try:
                await page.get_by_text("رقم الحجز", exact=False).first.wait_for(timeout=10000)
            except Exception:
                await page.screenshot(path=str(SHOTS / "book_defaults_no_confirm.png"))
                failures.append("no booking-success screen after submit")

            await page.screenshot(path=str(SHOTS / "book_defaults_after_submit.png"))
            await page.wait_for_timeout(600)

            # Verify DB row exists with SANITIZED values (trigger overrides).
            rows = sb(
                f"/rest/v1/appointments?patient_name=eq.{patient}"
                f"&select=id,status,notes", method="GET") or []
            if len(rows) != 1:
                failures.append(f"expected 1 appointment row for '{patient}', got {len(rows)}")
            else:
                inserted_id = rows[0]["id"]
                if rows[0]["status"] != "new":
                    failures.append(
                        f"status leaked injection: got {rows[0]['status']!r}, expected 'new'")
                if rows[0]["notes"] is not None:
                    failures.append(
                        f"notes leaked injection: got {rows[0]['notes']!r}, expected NULL")
                # And there should be no audit row (creation didn't trigger status change).
                audit = sb(
                    f"/rest/v1/appointment_audit?appointment_id=eq.{inserted_id}"
                    "&select=id", method="GET") or []
                if audit:
                    failures.append(
                        f"expected 0 audit rows for a fresh public booking, got {len(audit)}")
        finally:
            await browser.close()

    if inserted_id:
        try: sb(f"/rest/v1/appointments?id=eq.{inserted_id}", method="DELETE")
        except Exception: pass

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ book_defaults_enforced e2e passed "
          "(anon body injection of status/notes was neutralized by DB trigger)")

asyncio.run(main())
