"""
E2E: from an authenticated browser session (reception), invoke the RPC
`update_appointment_status` with a reason of 501 characters (no edge
whitespace → length after trim == 501). Both client- and server-side
`normalizeReason` slice at 500, so this "> 500 after normalize" boundary
can only be exercised by calling the RPC directly — that is what an
attacker bypassing the UI would do, and what the DB trigger
`log_appointment_change` is meant to defend against.

Expectations:
  - RPC throws with `reason_too_long` / "السبب طويل جدًا"
  - appointment status is unchanged (still 'confirmed')
  - 0 rows in appointment_audit for this appointment

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

        try:
            await sign_in(page, recep_email, recep_pwd)
            await page.screenshot(path=str(SHOTS / "reason501_before.png"))

            # Call the RPC directly from the authenticated browser session,
            # using the app's own Supabase client (bearer = reception user).
            rpc_result = await page.evaluate(
                """async ({ id, reason }) => {
                    const mod = await import('/src/integrations/supabase/client.ts');
                    const { data, error } = await mod.supabase.rpc(
                        'update_appointment_status',
                        { _id: id, _status: 'cancelled', _reason: reason },
                    );
                    return { data, error: error ? {
                        message: error.message, code: error.code, hint: error.hint,
                    } : null };
                }""",
                {"id": appt_id, "reason": REASON_501},
            )

            err = rpc_result.get("error")
            if not err:
                failures.append(f"expected RPC to reject 501-char reason, got success: {rpc_result}")
            else:
                msg = (err.get("message") or "") + " " + (err.get("hint") or "")
                if "reason_too_long" not in msg and "طويل" not in msg:
                    failures.append(f"expected 'reason_too_long' / 'طويل' in error, got: {err}")

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
    print("✅ reason-501-rejected e2e passed (DB rejected 501-char reason; no audit row created)")

asyncio.run(main())
