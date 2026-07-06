"""
E2E: from the reception admin UI, changing an appointment's status via the
"إلغاء" button (→ cancelled) with a valid reason padded by whitespace must:

  1. show the success toast «تم تحديث الحالة إلى: ملغى»
  2. update appointment.status to 'cancelled' in the DB
  3. add EXACTLY ONE new appointment_audit row with:
       - new_status = 'cancelled'
       - old_status = the pre-click status ('confirmed')
       - reason     = the trimmed reason (edges stripped, interior preserved,
                      length ≤ 500)
       - old_notes = new_notes = null (status-only change)
       - changed_by = the signed-in reception user

Also covers "إنهاء" (→ completed) with an optional reason that IS provided,
verifying the same accept-path invariants.

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/status_change_audit_row.py
"""
import asyncio, os, sys, time, json, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

URL  = os.environ["SUPABASE_URL"]
ANON = os.environ["SUPABASE_PUBLISHABLE_KEY"]
SVC  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

def sb(path, method="POST", body=None, key=SVC):
    req = urllib.request.Request(
        f"{URL}{path}", method=method,
        headers={"apikey": key, "Authorization": f"Bearer {key}",
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
    return (a[0] if isinstance(a, list) else a)["id"]

def promote_confirmed(aid):
    sb(f"/rest/v1/appointments?id=eq.{aid}",
       method="PATCH", body={"status": "confirmed"})
    # Discard any baseline audit rows so the RPC call under test is measured alone.
    sb(f"/rest/v1/appointment_audit?appointment_id=eq.{aid}", method="DELETE")

def status_of(aid):
    r = sb(f"/rest/v1/appointments?id=eq.{aid}&select=status", method="GET")
    return r[0]["status"] if r else None

def audit_rows(aid):
    return sb(
        f"/rest/v1/appointment_audit?appointment_id=eq.{aid}"
        f"&select=old_status,new_status,old_notes,new_notes,reason,changed_by"
        f"&order=changed_at.asc", method="GET") or []

async def sign_in(page, email, password):
    await page.goto("http://localhost:8080/auth", wait_until="networkidle")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/admin", timeout=15000)
    await page.wait_for_timeout(800)
    await page.get_by_text("المواعيد", exact=True).first.click()
    await page.wait_for_timeout(1200)

# (button label, target status, success-toast fragment, provided reason, expected reason)
CORE = "قرار المريض\tإلغاء بسبب  السفر\nمهم"      # interior ws MUST survive
CASES = [
    ("إلغاء", "cancelled", "ملغي",  f"  \t\n\u00A0{CORE}\u00A0 \r\n", CORE),
    ("إنهاء", "completed", "منتهي", "  تم الحضور والفحص  ",           "تم الحضور والفحص"),
]

async def main():
    stamp = int(time.time())
    uid, email, pwd = create_user(f"e2e-audit-row-{stamp}@test.local", "reception")
    failures: list[str] = []
    ids: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        try:
            plan = []
            for i, (label, db_status, toast_frag, raw, expected) in enumerate(CASES):
                patient = f"AUDIT-{db_status}-{stamp}-{i}"
                aid = new_appt(patient); ids.append(aid)
                promote_confirmed(aid)
                plan.append((label, db_status, toast_frag, raw, expected, patient, aid))

            await sign_in(page, email, pwd)
            await page.locator("tr", has_text=plan[0][5]).last.wait_for(timeout=10000)

            for (label, db_status, toast_frag, raw, expected, patient, aid) in plan:
                status_before = status_of(aid)
                audit_before  = len(audit_rows(aid))

                js_literal = json.dumps(raw)
                await page.evaluate(f"() => {{ window.prompt = () => {js_literal}; }}")

                row = page.locator("tr", has_text=patient).last
                try:
                    await row.wait_for(timeout=8000)
                except Exception:
                    failures.append(f"[{db_status}] row not visible")
                    continue

                btn = row.get_by_role("button", name=label)
                if await btn.count() == 0:
                    failures.append(
                        f"[{db_status}] '{label}' button missing "
                        f"(status_before={status_before})")
                    continue
                await btn.first.click()

                # (1) success toast
                success = page.get_by_text(f"تم تحديث الحالة إلى: {toast_frag}").first
                try:
                    await success.wait_for(timeout=6000)
                except Exception:
                    failures.append(
                        f"[{db_status}] success toast «تم تحديث الحالة إلى: {toast_frag}» not shown")

                await page.wait_for_timeout(600)

                # (2) DB status changed
                status_after = status_of(aid)
                if status_after != db_status:
                    failures.append(
                        f"[{db_status}] status not updated: {status_before} → {status_after}")

                # (3) exactly ONE new audit row with correct fields
                rows = audit_rows(aid)
                if len(rows) != audit_before + 1:
                    failures.append(
                        f"[{db_status}] audit rows delta expected 1, got "
                        f"{len(rows) - audit_before} (before={audit_before}, after={len(rows)})")
                    continue
                r = rows[-1]
                if r.get("new_status") != db_status:
                    failures.append(
                        f"[{db_status}] audit.new_status={r.get('new_status')!r}, expected {db_status!r}")
                if r.get("old_status") != status_before:
                    failures.append(
                        f"[{db_status}] audit.old_status={r.get('old_status')!r}, expected {status_before!r}")
                if r.get("old_notes") is not None or r.get("new_notes") is not None:
                    failures.append(
                        f"[{db_status}] status-only change must not record notes "
                        f"(old_notes={r.get('old_notes')!r}, new_notes={r.get('new_notes')!r})")
                if r.get("reason") != expected:
                    failures.append(
                        f"[{db_status}] audit.reason mismatch\n      "
                        f"expected({len(expected)})={expected!r}\n      "
                        f"got     ({len(r.get('reason') or '')})={r.get('reason')!r}")
                if r.get("changed_by") != uid:
                    failures.append(
                        f"[{db_status}] audit.changed_by={r.get('changed_by')!r}, expected {uid!r}")

                await page.wait_for_timeout(1000)

            await page.screenshot(path=str(SHOTS / "status_change_audit_row.png"))
        finally:
            await browser.close()

    # cleanup
    for aid in ids:
        try: sb(f"/rest/v1/appointments?id=eq.{aid}", method="DELETE")
        except Exception: pass
    delete_user(uid)

    if failures:
        print(f"❌ {len(failures)} failure(s) across {len(CASES)} scenarios")
        for f in failures: print(" -", f)
        sys.exit(1)
    print(f"✅ status_change_audit_row: all {len(CASES)} UI updates produced the "
          f"expected audit row with trimmed reason and correct fields")

asyncio.run(main())
