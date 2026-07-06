"""
E2E: cancel an appointment through the admin UI with a reason padded by
whitespace, then open the history modal and assert the audit row shows the
reason trimmed to its exact value.

Flow:
  1. Seed a confirmed appointment via Supabase Admin API.
  2. Sign in through /auth as a reception user.
  3. Override window.prompt to return "   طلب المريض إلغاء الحجز   ".
  4. Click "إلغاء" → mutation runs; audit row is inserted by the trigger.
  5. Click "السجل" on the same row → modal opens.
  6. Assert the modal contains the trimmed reason verbatim
     ("طلب المريض إلغاء الحجز") — no leading/trailing whitespace.
  7. Cross-check via service key that appointment_audit.reason matches
     exactly (no whitespace).

Env required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run:         python3 tests/e2e/history_modal_trimmed_reason.py
"""
import asyncio, os, sys, time, json, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = os.environ["SUPABASE_URL"]
ANON = os.environ["SUPABASE_PUBLISHABLE_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

def sb(path, method="POST", body=None, key=SERVICE, extra=None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}", method=method,
        headers={
            "apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            **(extra or {}),
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None

def create_user(email, role):
    pwd = f"Test!{int(time.time()*1000)}Aa1"
    u = sb("/auth/v1/admin/users",
           body={"email": email, "password": pwd, "email_confirm": True})
    if role:
        sb("/rest/v1/user_roles", body={"user_id": u["id"], "role": role})
    return u["id"], email, pwd

def delete_user(uid):
    try: sb(f"/auth/v1/admin/users/{uid}", method="DELETE")
    except Exception: pass

async def sign_in(page, email, password):
    await page.goto("http://localhost:8080/auth", wait_until="domcontentloaded")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/admin", timeout=10000)

RAW_REASON = "   طلب المريض إلغاء الحجز   "
EXPECTED   = "طلب المريض إلغاء الحجز"

async def main():
    stamp = int(time.time())
    recep_id, recep_email, recep_pwd = create_user(
        f"e2e-trim-{stamp}@test.local", "reception")
    appt = sb("/rest/v1/appointments", body={
        "patient_name": "TRIM-Reason-Test",
        "patient_phone": "0500000000",
        "appointment_date": time.strftime("%Y-%m-%d", time.gmtime(time.time() + 86400)),
        "appointment_time": "11:00",
        "status": "confirmed",
    })
    appt_id = (appt[0] if isinstance(appt, list) else appt)["id"]

    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        try:
            await sign_in(page, recep_email, recep_pwd)

            # Stub prompt to return the padded reason
            await page.evaluate(
                "(v) => { window.prompt = () => v; }", RAW_REASON)

            row = page.locator("tr", has_text="TRIM-Reason-Test")
            await row.wait_for(timeout=10000)
            await page.screenshot(path=str(SHOTS / "1_before_cancel.png"))

            await row.get_by_role("button", name="إلغاء").click()

            # Wait for status change to reflect in the row
            await row.get_by_text("ملغي").wait_for(timeout=8000)
            await page.screenshot(path=str(SHOTS / "2_after_cancel.png"))

            # Open history modal
            await row.get_by_title("سجل التغييرات").click()
            await page.get_by_text("سجل تغييرات الحجز").wait_for(timeout=5000)

            # The reason block renders as: "السبب: <value>"
            reason_row = page.locator("div", has_text="السبب:").filter(
                has_text=EXPECTED)
            try:
                await reason_row.first.wait_for(timeout=5000)
            except Exception:
                failures.append("expected trimmed reason not visible in modal")

            modal_txt = await page.locator(".fixed.inset-0").inner_text()
            await page.screenshot(path=str(SHOTS / "3_history_modal.png"))

            if EXPECTED not in modal_txt:
                failures.append(f"modal missing exact reason. Got: {modal_txt[:400]!r}")
            # Reject the padded form: it must NOT contain the raw whitespace-wrapped variant
            if RAW_REASON in modal_txt:
                failures.append("modal shows untrimmed reason (leading/trailing whitespace present)")

            # DB cross-check via service key
            audit = sb(
                f"/rest/v1/appointment_audit?appointment_id=eq.{appt_id}"
                f"&select=reason,new_status&order=changed_at.desc",
                method="GET")
            if not audit:
                failures.append("no audit row created")
            else:
                r0 = audit[0]
                if r0["new_status"] != "cancelled":
                    failures.append(f"audit new_status={r0['new_status']}, expected cancelled")
                if r0["reason"] != EXPECTED:
                    failures.append(
                        f"audit.reason not trimmed. DB={r0['reason']!r}, expected={EXPECTED!r}")
        finally:
            await browser.close()

    # cleanup
    try: sb(f"/rest/v1/appointments?id=eq.{appt_id}", method="DELETE")
    except Exception: pass
    delete_user(recep_id)

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ history-modal trimmed-reason e2e passed")

asyncio.run(main())
