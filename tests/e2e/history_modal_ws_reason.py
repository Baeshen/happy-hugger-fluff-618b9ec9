"""
E2E: reception cancels an appointment with a reason containing tabs,
newlines, and NBSP (U+00A0). The trimmed reason must appear verbatim in
the history modal and in appointment_audit.reason — with no leading/trailing
whitespace and no lingering NBSP at the edges.

Flow:
  1. Seed a confirmed appointment via Supabase Admin API.
  2. Sign in through /auth as reception.
  3. Stub window.prompt to return "\u00A0\t\n طلب المريض إلغاء الحجز \n\t\u00A0".
  4. Click "إلغاء" → mutation runs; trigger writes audit row.
  5. Open history modal from the row.
  6. Assert modal contains exact trimmed reason and does NOT contain the
     raw padded form; check no NBSP on edges of the rendered value.
  7. DB cross-check via service key that appointment_audit.reason equals
     exactly the trimmed value.

Env required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run:         python3 tests/e2e/history_modal_ws_reason.py
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

NBSP = "\u00A0"
RAW_REASON = f"{NBSP}\t\n طلب المريض إلغاء الحجز \n\t{NBSP}"
EXPECTED   = "طلب المريض إلغاء الحجز"

async def main():
    stamp = int(time.time())
    recep_id, email, pwd = create_user(f"e2e-ws-{stamp}@test.local", "reception")
    appt = sb("/rest/v1/appointments", body={
        "patient_name": "WS-Trim-Modal",
        "patient_phone": "0500000000",
        "appointment_date": time.strftime("%Y-%m-%d", time.gmtime(time.time() + 86400)),
        "appointment_time": "12:00",
        "status": "confirmed",
    })
    appt_id = (appt[0] if isinstance(appt, list) else appt)["id"]

    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        try:
            await sign_in(page, email, pwd)

            # Stub prompt to return the raw whitespace-padded reason (using JSON to preserve escapes)
            await page.evaluate("(v) => { window.prompt = () => v; }", RAW_REASON)

            row = page.locator("tr", has_text="WS-Trim-Modal")
            await row.wait_for(timeout=10000)
            await page.screenshot(path=str(SHOTS / "1_before_cancel.png"))

            await row.get_by_role("button", name="إلغاء").click()

            # Wait for the row's status to flip to "ملغي"
            await row.get_by_text("ملغي").wait_for(timeout=8000)
            await page.screenshot(path=str(SHOTS / "2_after_cancel.png"))

            # Open history modal
            await row.get_by_title("سجل التغييرات").click()
            await page.get_by_text("سجل تغييرات الحجز").wait_for(timeout=5000)

            # Extract the exact rendered reason value from the modal
            reason_value = await page.evaluate("""() => {
              const modal = document.querySelector('.fixed.inset-0');
              if (!modal) return null;
              // Find the "السبب:" block; the reason text follows the label span.
              const nodes = modal.querySelectorAll('div');
              for (const n of nodes) {
                const t = n.textContent || '';
                if (t.trim().startsWith('السبب:')) {
                  // strip the leading label
                  return t.replace(/^\\s*السبب:\\s*/, '');
                }
              }
              return null;
            }""")
            await page.screenshot(path=str(SHOTS / "3_history_modal.png"))

            if reason_value is None:
                failures.append("could not locate 'السبب:' block in modal")
            else:
                # Must equal the trimmed value exactly (no NBSP/tab/newline at edges)
                if reason_value != EXPECTED:
                    failures.append(
                        f"modal reason mismatch\n  got ={reason_value!r}\n  want={EXPECTED!r}")
                # And must not contain edge NBSP/tab/newline explicitly
                if reason_value.startswith((NBSP, "\t", "\n", " ")) or \
                   reason_value.endswith((NBSP, "\t", "\n", " ")):
                    failures.append(f"modal reason has edge whitespace: {reason_value!r}")

            # DB cross-check via service key
            audit = sb(
                f"/rest/v1/appointment_audit?appointment_id=eq.{appt_id}"
                f"&select=reason,new_status,old_status&order=changed_at.desc",
                method="GET")
            if not audit:
                failures.append("no audit row created")
            else:
                r0 = audit[0]
                if r0["new_status"] != "cancelled":
                    failures.append(f"audit new_status={r0['new_status']}, expected cancelled")
                if r0["old_status"] != "confirmed":
                    failures.append(f"audit old_status={r0['old_status']}, expected confirmed")
                if r0["reason"] != EXPECTED:
                    failures.append(
                        f"audit.reason not trimmed\n  DB  ={r0['reason']!r}\n  want={EXPECTED!r}")
        finally:
            await browser.close()

    try: sb(f"/rest/v1/appointments?id=eq.{appt_id}", method="DELETE")
    except Exception: pass
    delete_user(recep_id)

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ history modal shows trimmed reason for \\n/\\t/NBSP input")

asyncio.run(main())
