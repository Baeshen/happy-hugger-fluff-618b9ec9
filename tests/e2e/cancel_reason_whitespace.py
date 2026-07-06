"""
E2E: reception cancels an appointment through the admin UI. The reason
prompt is answered with whitespace only. The UI must:
  - show the error toast "السبب مطلوب لهذا الإجراء"
  - NOT call updateAppointmentStatus
  - leave the appointment status unchanged
  - not create any row in appointment_audit for this appointment

Env required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run:         python3 tests/e2e/cancel_reason_whitespace.py
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

async def main():
    stamp = int(time.time())
    recep_id, recep_email, recep_pwd = create_user(f"e2e-recep-ws-{stamp}@test.local", "reception")
    appt = sb("/rest/v1/appointments", body={
        "patient_name": "WS-Reason-Test",
        "patient_phone": "0500000000",
        "appointment_date": time.strftime("%Y-%m-%d", time.gmtime(time.time() + 86400)),
        "appointment_time": "10:00",
        "status": "confirmed",
    })
    appt_id = (appt[0] if isinstance(appt, list) else appt)["id"]

    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # Track server-fn POSTs to ensure updateAppointmentStatus is NOT called
        status_fn_calls = []
        def on_req(req):
            u = req.url
            if "_serverFn" in u and req.method == "POST":
                status_fn_calls.append(u)
        page.on("request", on_req)

        try:
            await sign_in(page, recep_email, recep_pwd)

            # Stub window.prompt to return whitespace-only reason
            await page.evaluate("() => { window.prompt = () => '   \\n\\t   '; }")

            row = page.locator("tr", has_text="WS-Reason-Test")
            await row.wait_for(timeout=10000)
            await page.screenshot(path=str(SHOTS / "1_before_cancel.png"))

            await row.get_by_role("button", name="إلغاء").click()

            # Toast should appear
            toast = page.get_by_text("السبب مطلوب لهذا الإجراء")
            try:
                await toast.wait_for(timeout=4000)
            except Exception:
                failures.append("expected toast 'السبب مطلوب لهذا الإجراء' did not appear")
            await page.screenshot(path=str(SHOTS / "2_after_cancel_click.png"))

            # Give any (unexpected) network activity a moment to settle
            await page.wait_for_timeout(800)

            if status_fn_calls:
                failures.append(f"updateAppointmentStatus was called {len(status_fn_calls)}× (expected 0)")

            # DB assertions via service key
            row_now = sb(f"/rest/v1/appointments?id=eq.{appt_id}&select=status",
                        method="GET")[0]
            if row_now["status"] != "confirmed":
                failures.append(f"status changed to {row_now['status']} (expected 'confirmed')")

            audit = sb(f"/rest/v1/appointment_audit?appointment_id=eq.{appt_id}&select=id",
                      method="GET")
            if audit:
                failures.append(f"expected 0 audit rows, got {len(audit)}")

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
    print("✅ cancel-with-whitespace-reason e2e passed")

asyncio.run(main())
