"""
E2E: an unauthorized notes update MUST NOT create any appointment_audit row
and MUST surface an error toast in the UI.

Strategy: sign in as reception (so we can reach the admin appointments UI and
the 'ملاحظة' button on a row), stub window.prompt to a valid note, then
revoke the reception role via the service key BEFORE clicking. The server
function `updateAppointmentNotes` re-reads roles on every call, so
`ensureRole` throws → the client mutation's onError renders the toast text
"ليست لديك الصلاحية لتنفيذ هذا الإجراء." and no audit row is created.

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/notes_unauthorized_no_audit.py
"""
import asyncio, os, sys, time, json, urllib.request, urllib.parse
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

def new_appt(name):
    a = sb("/rest/v1/appointments", body={
        "patient_name": name,
        "patient_phone": "0500000000",
        "appointment_date": time.strftime("%Y-%m-%d", time.gmtime(time.time() + 86400)),
        "appointment_time": "10:00",
        "status": "confirmed",
    })
    aid = (a[0] if isinstance(a, list) else a)["id"]
    sb(f"/rest/v1/appointments?id=eq.{aid}", method="PATCH",
       body={"status": "confirmed"})
    sb(f"/rest/v1/appointment_audit?appointment_id=eq.{aid}", method="DELETE")
    return aid

def audit_count(aid):
    r = sb(f"/rest/v1/appointment_audit?appointment_id=eq.{aid}&select=id",
           method="GET") or []
    return len(r)

def notes_of(aid):
    r = sb(f"/rest/v1/appointments?id=eq.{aid}&select=notes", method="GET")
    return r[0]["notes"] if r else None

async def sign_in(page, email, password):
    await page.goto("http://localhost:8080/auth", wait_until="networkidle")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/admin", timeout=15000)
    await page.wait_for_timeout(800)
    await page.get_by_text("المواعيد", exact=True).first.click()
    await page.wait_for_timeout(1200)

ERROR_MSG = "ليست لديك الصلاحية لتنفيذ هذا الإجراء."

async def main():
    stamp = int(time.time())
    patient = f"NOTES-UNAUTH-{stamp}"
    uid, email, pwd = create_user(f"e2e-unauth-notes-{stamp}@test.local", "reception")
    aid = new_appt(patient)
    notes_before = notes_of(aid)
    audit_before = audit_count(aid)
    failures = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        try:
            await sign_in(page, email, pwd)

            row = page.locator("tr", has_text=patient).last
            await row.wait_for(timeout=10000)

            btn = row.get_by_role("button", name="ملاحظة")
            if await btn.count() == 0:
                failures.append("'ملاحظة' button not present on reception row")
            else:
                await page.evaluate(
                    "() => { window.prompt = () => 'ملاحظة جديدة مقبولة'; }"
                )

                # Revoke the reception role RIGHT BEFORE the click so the
                # server-side ensureRole() rejects on the next call.
                role_filter = urllib.parse.quote(f"user_id=eq.{uid}&role=eq.reception",
                                                 safe="=&.")
                sb(f"/rest/v1/user_roles?{role_filter}", method="DELETE")

                await btn.first.click()

                toast = page.get_by_text(ERROR_MSG)
                try:
                    await toast.wait_for(timeout=8000)
                except Exception:
                    # Accept any visible sonner error toast that surfaces the
                    # authorization failure — screenshot for evidence.
                    await page.screenshot(path=str(SHOTS / "notes_unauth_no_toast.png"))
                    failures.append(
                        f"expected error toast «{ERROR_MSG}» not shown")

                await page.screenshot(path=str(SHOTS / "notes_unauth_after_click.png"))
                await page.wait_for_timeout(800)

            # No side-effects: notes unchanged AND zero new audit rows.
            if notes_of(aid) != notes_before:
                failures.append(
                    f"notes changed from {notes_before!r} to {notes_of(aid)!r} "
                    "despite unauthorized call")
            after = audit_count(aid)
            if after != audit_before:
                failures.append(
                    f"expected audit rows unchanged (was {audit_before}), got {after}")
        finally:
            await browser.close()

    # cleanup
    try: sb(f"/rest/v1/appointments?id=eq.{aid}", method="DELETE")
    except Exception: pass
    delete_user(uid)

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ notes-unauthorized-no-audit e2e passed "
          "(server rejected notes update; UI toast shown; 0 audit rows)")

asyncio.run(main())
