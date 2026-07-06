"""
E2E: reception cancels an appointment through the admin UI, but the outgoing
server-function request is intercepted and its `reason` field is rewritten to
a 501-character string (after trim). The DB trigger `log_appointment_change`
must reject it with `reason_too_long`. The UI must:
  - show the toast "السبب طويل جدًا (الحد الأقصى 500 حرفًا)"
  - leave the appointment status unchanged
  - not create any row in appointment_audit for this appointment

Client-side normalizeReason() slices to 500, so we can't send 501 via the
prompt alone — we rewrite the request body just before it leaves the browser.

Env required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run:         python3 tests/e2e/reason_501_rejected.py
"""
import asyncio, os, sys, time, json, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

def sb(path, method="POST", body=None, extra=None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}", method=method,
        headers={
            "apikey": SERVICE, "Authorization": f"Bearer {SERVICE}",
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
    await page.goto("http://localhost:8080/auth", wait_until="networkidle")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/admin", timeout=15000)
    await page.wait_for_timeout(800)
    await page.get_by_text("المواعيد", exact=True).first.click()
    await page.wait_for_timeout(1200)

REASON_501 = "ب" * 501  # 501 chars, no edge whitespace → length after trim == 501

async def main():
    stamp = int(time.time())
    recep_id, recep_email, recep_pwd = create_user(
        f"e2e-recep-501-{stamp}@test.local", "reception")
    appt = sb("/rest/v1/appointments", body={
        "patient_name": f"Reason501-{stamp}",
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

        # Rewrite the outgoing server-fn request body to inject a 501-char reason,
        # bypassing client-side normalizeReason() slicing to 500.
        SENTINEL = "REASON_SENTINEL_TOKEN_XYZ"
        async def rewrite_reason(route, request):
            try:
                body = request.post_data or ""
                if body:
                    print("  req:", request.url[:80], "hasSentinel=", SENTINEL in body)
                if SENTINEL in body:
                    new_body = body.replace(SENTINEL, REASON_501)
                    await route.continue_(post_data=new_body)
                    return
            except Exception as e:
                print("  interceptor err:", e)
            await route.continue_()

        try:
            await sign_in(page, recep_email, recep_pwd)

            # Register interceptor AFTER sign-in; it swaps SENTINEL → 501-char string
            # right before the request leaves the browser, bypassing the client-side
            # normalizeReason() slice-to-500.
            await page.route("**/*", rewrite_reason)
            await page.evaluate(f"() => {{ window.prompt = () => {json.dumps(SENTINEL)}; }}")

            row = page.locator("tr", has_text=f"Reason501-{stamp}")
            await row.wait_for(timeout=10000)
            await page.screenshot(path=str(SHOTS / "reason501_1_before.png"))

            await row.get_by_role("button", name="إلغاء").click()

            toast = page.get_by_text("السبب طويل جدًا (الحد الأقصى 500 حرفًا)")
            try:
                await toast.wait_for(timeout=6000)
            except Exception:
                failures.append("expected toast 'السبب طويل جدًا …' did not appear")
            await page.screenshot(path=str(SHOTS / "reason501_2_after.png"))

            await page.wait_for_timeout(600)

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

    try: sb(f"/rest/v1/appointments?id=eq.{appt_id}", method="DELETE")
    except Exception: pass
    delete_user(recep_id)

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ reason-501-rejected e2e passed")

asyncio.run(main())
