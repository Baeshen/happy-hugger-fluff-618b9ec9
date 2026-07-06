"""
E2E: from the reception admin UI, editing an appointment's notes via the
"ملاحظة" button must:

  1. show the success toast «تم تحديث الملاحظات»
  2. update appointments.notes in the DB (edges trimmed, interior kept verbatim)
  3. add EXACTLY ONE new appointment_audit row with:
       - old_status = new_status = null (notes-only change)
       - new_notes  = the trimmed notes (edges stripped, interior preserved)
       - old_notes  = the pre-click notes value
       - reason     = null (no reason provided)
       - changed_by = the signed-in reception user

Two scenarios:
  A. Set notes from null → padded new value (edges trimmed).
  B. Clear existing notes (user erases the prompt content) → notes becomes
     NULL on the row, audit row records old=<existing> → new=null.

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/notes_edit_audit_row.py
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

def new_appt(name, initial_notes=None):
    a = sb("/rest/v1/appointments", body={
        "patient_name": name,
        "patient_phone": "0500000000",
        "appointment_date": time.strftime("%Y-%m-%d", time.gmtime(time.time() + 86400)),
        "appointment_time": "10:00",
        "status": "confirmed",
    })
    aid = (a[0] if isinstance(a, list) else a)["id"]
    patch = {"status": "confirmed"}
    if initial_notes is not None:
        patch["notes"] = initial_notes
    sb(f"/rest/v1/appointments?id=eq.{aid}", method="PATCH", body=patch)
    # Discard any baseline audit rows so the RPC call under test is measured alone.
    sb(f"/rest/v1/appointment_audit?appointment_id=eq.{aid}", method="DELETE")
    return aid

def notes_of(aid):
    r = sb(f"/rest/v1/appointments?id=eq.{aid}&select=notes", method="GET")
    return r[0]["notes"] if r else None

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

CORE = "ملاحظة الطبيب\tالمريض بحاجة\nمتابعة  خلال أسبوع"  # interior ws MUST survive

# (label, initial notes on row, raw prompt input, expected DB notes value)
CASES = [
    ("set-from-null", None,           f"  \t\n\u00A0{CORE}\u00A0 \r\n", CORE),
    ("clear-existing", "قديم يحذف",   "   ",                             None),
]

async def main():
    stamp = int(time.time())
    uid, email, pwd = create_user(f"e2e-notes-audit-{stamp}@test.local", "reception")
    failures: list[str] = []
    ids: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        try:
            plan = []
            for label, initial, raw, expected in CASES:
                patient = f"NOTES-{label}-{stamp}"
                aid = new_appt(patient, initial_notes=initial); ids.append(aid)
                plan.append((label, initial, raw, expected, patient, aid))

            await sign_in(page, email, pwd)
            await page.locator("tr", has_text=plan[0][4]).last.wait_for(timeout=10000)

            for (label, initial, raw, expected, patient, aid) in plan:
                notes_before = notes_of(aid)
                audit_before = len(audit_rows(aid))

                js_literal = json.dumps(raw)
                await page.evaluate(f"() => {{ window.prompt = () => {js_literal}; }}")

                row = page.locator("tr", has_text=patient).last
                try:
                    await row.wait_for(timeout=8000)
                except Exception:
                    failures.append(f"[{label}] row not visible")
                    continue

                btn = row.get_by_role("button", name="ملاحظة")
                if await btn.count() == 0:
                    failures.append(f"[{label}] 'ملاحظة' button missing on row")
                    continue
                await btn.first.click()

                # (1) success toast
                try:
                    await page.get_by_text("تم تحديث الملاحظات").first.wait_for(timeout=6000)
                except Exception:
                    failures.append(f"[{label}] success toast «تم تحديث الملاحظات» not shown")

                await page.wait_for_timeout(600)

                # (2) DB notes updated
                notes_after = notes_of(aid)
                if notes_after != expected:
                    failures.append(
                        f"[{label}] notes mismatch\n      "
                        f"expected={expected!r}\n      got     ={notes_after!r}")

                # (3) exactly ONE new audit row with correct fields
                rows = audit_rows(aid)
                if len(rows) != audit_before + 1:
                    failures.append(
                        f"[{label}] audit rows delta expected 1, got "
                        f"{len(rows) - audit_before} (before={audit_before}, after={len(rows)})")
                    continue
                r = rows[-1]
                if r.get("old_status") is not None or r.get("new_status") is not None:
                    failures.append(
                        f"[{label}] notes-only change must not record status "
                        f"(old_status={r.get('old_status')!r}, new_status={r.get('new_status')!r})")
                if r.get("old_notes") != notes_before:
                    failures.append(
                        f"[{label}] audit.old_notes={r.get('old_notes')!r}, expected {notes_before!r}")
                if r.get("new_notes") != expected:
                    failures.append(
                        f"[{label}] audit.new_notes mismatch\n      "
                        f"expected({0 if expected is None else len(expected)})={expected!r}\n      "
                        f"got     ({0 if r.get('new_notes') is None else len(r.get('new_notes') or '')})={r.get('new_notes')!r}")
                if r.get("reason") is not None:
                    failures.append(
                        f"[{label}] audit.reason must be null when no reason provided, got {r.get('reason')!r}")
                if r.get("changed_by") != uid:
                    failures.append(
                        f"[{label}] audit.changed_by={r.get('changed_by')!r}, expected {uid!r}")

                await page.wait_for_timeout(1000)

            await page.screenshot(path=str(SHOTS / "notes_edit_audit_row.png"))
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
    print(f"✅ notes_edit_audit_row: all {len(CASES)} UI edits produced the "
          f"expected audit row with trimmed notes and correct fields")

asyncio.run(main())
