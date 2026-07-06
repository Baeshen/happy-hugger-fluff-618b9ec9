"""
E2E: appointment_audit.changed_by MUST match the signed-in user for both
status and notes updates made through the admin UI. We run two independent
signed-in sessions (two distinct reception users) and cross-check that each
UI-driven change records exactly that user's id — never null, never the
other user's id.

Assertions per case:
  - success toast appears
  - a single new appointment_audit row is created
  - row.changed_by == the acting user's auth id
  - row.changed_by has the expected role in user_roles (reception here)
  - the "other" user's id never appears on the row

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/audit_changed_by.py
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

def audit_rows(aid):
    return sb(
        f"/rest/v1/appointment_audit?appointment_id=eq.{aid}"
        f"&select=old_status,new_status,old_notes,new_notes,reason,changed_by"
        f"&order=changed_at.asc", method="GET") or []

def roles_of(uid):
    r = sb(f"/rest/v1/user_roles?user_id=eq.{uid}&select=role",
           method="GET") or []
    return sorted([x["role"] for x in r])

async def sign_in(page, email, password):
    await page.goto("http://localhost:8080/auth", wait_until="networkidle")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/admin", timeout=15000)
    await page.wait_for_timeout(800)
    await page.get_by_text("المواعيد", exact=True).first.click()
    await page.wait_for_timeout(1200)

async def do_status_cancel(page, patient, reason):
    await page.evaluate(f"() => {{ window.prompt = () => {json.dumps(reason)}; }}")
    row = page.locator("tr", has_text=patient).last
    await row.wait_for(timeout=10000)
    await row.get_by_role("button", name="إلغاء").click()
    await page.get_by_text("تم تحديث الحالة إلى:").first.wait_for(timeout=8000)
    await page.wait_for_timeout(500)

async def do_notes_edit(page, patient, notes):
    await page.evaluate(f"() => {{ window.prompt = () => {json.dumps(notes)}; }}")
    row = page.locator("tr", has_text=patient).last
    await row.wait_for(timeout=10000)
    await row.get_by_role("button", name="ملاحظة").click()
    await page.get_by_text("تم تحديث الملاحظات").first.wait_for(timeout=8000)
    await page.wait_for_timeout(500)

async def run_session(email, pwd, patient, action):
    """action ∈ {'status','notes'} — returns the created audit row."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        try:
            await sign_in(page, email, pwd)
            if action == "status":
                await do_status_cancel(page, patient, "سبب الإلغاء عبر الواجهة")
            else:
                await do_notes_edit(page, patient, "ملاحظة عبر الواجهة")
            await page.screenshot(
                path=str(SHOTS / f"changed_by_{action}_{int(time.time())}.png"))
        finally:
            await browser.close()

async def main():
    stamp = int(time.time())
    u1_id, u1_email, u1_pwd = create_user(f"e2e-cby-a-{stamp}@test.local", "reception")
    u2_id, u2_email, u2_pwd = create_user(f"e2e-cby-b-{stamp}@test.local", "reception")

    a_status = new_appt(f"CBY-STATUS-{stamp}")
    a_notes  = new_appt(f"CBY-NOTES-{stamp}")
    failures = []

    try:
        # Session 1: user A changes status via UI
        await run_session(u1_email, u1_pwd, f"CBY-STATUS-{stamp}", "status")
        # Session 2: user B edits notes via UI
        await run_session(u2_email, u2_pwd, f"CBY-NOTES-{stamp}",  "notes")

        for label, aid, actor_id, other_id in [
            ("status-by-A", a_status, u1_id, u2_id),
            ("notes-by-B",  a_notes,  u2_id, u1_id),
        ]:
            rows = audit_rows(aid)
            if len(rows) != 1:
                failures.append(f"[{label}] expected 1 audit row, got {len(rows)}")
                continue
            r = rows[0]
            if r.get("changed_by") is None:
                failures.append(f"[{label}] changed_by is NULL")
            if r.get("changed_by") != actor_id:
                failures.append(
                    f"[{label}] changed_by mismatch: got {r.get('changed_by')!r} "
                    f"expected {actor_id!r}")
            if r.get("changed_by") == other_id:
                failures.append(
                    f"[{label}] changed_by leaked the OTHER user's id ({other_id})")
            # Role sanity: the recorded user must actually have the expected role
            actor_roles = roles_of(r.get("changed_by") or "")
            if "reception" not in actor_roles:
                failures.append(
                    f"[{label}] changed_by user roles={actor_roles}, "
                    "expected to include 'reception'")

        # Extra shape checks so we know the audit row is truly the UI action.
        s_rows = audit_rows(a_status)
        if s_rows and s_rows[0].get("new_status") != "cancelled":
            failures.append(
                f"[status-by-A] new_status={s_rows[0].get('new_status')!r}, expected 'cancelled'")
        n_rows = audit_rows(a_notes)
        if n_rows and (n_rows[0].get("new_status") is not None
                       or n_rows[0].get("old_status") is not None):
            failures.append(
                "[notes-by-B] notes-only change must not record status columns")

    finally:
        for aid in (a_status, a_notes):
            try: sb(f"/rest/v1/appointments?id=eq.{aid}", method="DELETE")
            except Exception: pass
        delete_user(u1_id)
        delete_user(u2_id)

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ audit-changed-by e2e passed "
          "(status + notes UI edits recorded the correct signed-in user)")

asyncio.run(main())
