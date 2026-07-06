"""
E2E: a signed-in authorized user (reception role) completes a valid booking
through the public /book UI. Assertions:

  1. Booking success screen appears («رقم الحجز …»).
  2. Exactly ONE appointments row is created for the chosen patient with:
       - status = 'new'         (initial insert, trigger keeps it as 'new')
       - notes  = NULL
       - patient_name / patient_phone match what was submitted
       - appointment_date / appointment_time are populated
  3. NO appointment_audit row exists for that appointment yet (audit trigger
     fires on UPDATE only — a fresh INSERT must not emit an audit row).
  4. When the same signed-in reception user then cancels the appointment
     from the admin UI with a valid reason, appointment_audit contains
     EXACTLY ONE row with:
       - changed_by  = the acting reception user's auth id
       - old_status  = 'new'
       - new_status  = 'cancelled'
       - reason      = the trimmed reason text
       - old_notes = new_notes = NULL  (status-only change)

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/book_authorized_valid.py
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
    pwd = f"Test!{int(time.time() * 1000)}Aa1"
    u = sb("/auth/v1/admin/users",
           body={"email": email, "password": pwd, "email_confirm": True})
    if role:
        sb("/rest/v1/user_roles", body={"user_id": u["id"], "role": role})
    return u["id"], email, pwd


def delete_user(uid):
    try:
        sb(f"/auth/v1/admin/users/{uid}", method="DELETE")
    except Exception:
        pass


async def sign_in(page, email, password):
    await page.goto("http://localhost:8080/auth", wait_until="networkidle")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/admin", timeout=15000)
    await page.wait_for_timeout(800)


async def complete_booking(page, patient, phone):
    await page.goto("http://localhost:8080/book", wait_until="networkidle")
    await page.wait_for_timeout(600)
    await page.screenshot(path=str(SHOTS / "book_auth_step1.png"))

    card = page.locator("div.rounded-2xl").first
    await card.wait_for(timeout=8000)
    await card.get_by_role("button", name="الأطفال", exact=True).click()
    await page.wait_for_timeout(300)
    await page.locator('button:has-text("التالي")').click()

    # Step 2: any available doctor
    await page.wait_for_timeout(300)
    await card.get_by_role("button", name="أي طبيب متاح", exact=True).click()
    await page.wait_for_timeout(200)
    await page.locator('button:has-text("التالي")').click()

    # Step 3: pick first available date then first available time
    await page.wait_for_timeout(600)
    date_grid = card.locator("div.grid").first
    await date_grid.locator("button").first.wait_for(timeout=8000)
    await date_grid.locator("button").first.click()
    await page.wait_for_timeout(600)
    time_grid = card.locator("div.grid").nth(1)
    await time_grid.locator("button").first.wait_for(timeout=6000)
    await time_grid.locator("button").first.click()
    await page.wait_for_timeout(400)
    await page.locator('button:has-text("التالي")').click()

    # Step 4: patient info + confirm
    await page.wait_for_timeout(400)
    await page.screenshot(path=str(SHOTS / "book_auth_step4.png"))
    await page.locator("input").nth(0).fill(patient)
    await page.locator("input").nth(1).fill(phone)
    await page.locator('button:has-text("تأكيد الحجز")').click()
    await page.get_by_text("رقم الحجز", exact=False).first.wait_for(timeout=10000)
    await page.screenshot(path=str(SHOTS / "book_auth_success.png"))


async def cancel_from_admin(page, patient, reason):
    await page.goto("http://localhost:8080/admin", wait_until="networkidle")
    await page.wait_for_timeout(800)
    await page.get_by_text("المواعيد", exact=True).first.click()
    await page.wait_for_timeout(1200)
    await page.evaluate(f"() => {{ window.prompt = () => {json.dumps(reason)}; }}")
    row = page.locator("tr", has_text=patient).last
    await row.wait_for(timeout=10000)
    await row.get_by_role("button", name="إلغاء").click()
    await page.get_by_text("تم تحديث الحالة إلى:").first.wait_for(timeout=8000)
    await page.screenshot(path=str(SHOTS / "book_auth_after_cancel.png"))


async def main():
    stamp = int(time.time())
    patient = f"BookAuth-{stamp}"
    phone = "0501234567"
    reason = "  إلغاء بواسطة الاستقبال بعد حجز صحيح  "
    reason_trimmed = reason.strip()
    uid, email, pwd = create_user(f"e2e-book-auth-{stamp}@test.local", "reception")
    failures = []
    inserted_id = None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            try:
                await sign_in(page, email, pwd)
                await complete_booking(page, patient, phone)

                rows = sb(
                    f"/rest/v1/appointments?patient_name=eq.{patient}"
                    "&select=id,status,notes,patient_name,patient_phone,"
                    "appointment_date,appointment_time",
                    method="GET") or []
                if len(rows) != 1:
                    failures.append(
                        f"expected 1 appointment row for '{patient}', got {len(rows)}")
                else:
                    r = rows[0]
                    inserted_id = r["id"]
                    if r["status"] != "new":
                        failures.append(f"status={r['status']!r}, expected 'new'")
                    if r["notes"] is not None:
                        failures.append(f"notes={r['notes']!r}, expected NULL")
                    if r["patient_phone"] != phone:
                        failures.append(
                            f"patient_phone={r['patient_phone']!r}, expected {phone!r}")
                    if not r.get("appointment_date"):
                        failures.append("appointment_date is empty")
                    if not r.get("appointment_time"):
                        failures.append("appointment_time is empty")

                    pre_audit = sb(
                        f"/rest/v1/appointment_audit?appointment_id=eq.{inserted_id}"
                        "&select=id", method="GET") or []
                    if pre_audit:
                        failures.append(
                            f"fresh booking must create 0 audit rows, got {len(pre_audit)}")

                # UI-driven cancel by the signed-in reception user
                if inserted_id and not failures:
                    await cancel_from_admin(page, patient, reason)

                    audit = sb(
                        f"/rest/v1/appointment_audit?appointment_id=eq.{inserted_id}"
                        "&select=old_status,new_status,old_notes,new_notes,reason,changed_by"
                        "&order=changed_at.asc", method="GET") or []
                    if len(audit) != 1:
                        failures.append(
                            f"expected 1 audit row after cancel, got {len(audit)}")
                    else:
                        a = audit[0]
                        if a["changed_by"] != uid:
                            failures.append(
                                f"changed_by={a['changed_by']!r}, expected {uid!r}")
                        if a["old_status"] != "new":
                            failures.append(
                                f"old_status={a['old_status']!r}, expected 'new'")
                        if a["new_status"] != "cancelled":
                            failures.append(
                                f"new_status={a['new_status']!r}, expected 'cancelled'")
                        if a["reason"] != reason_trimmed:
                            failures.append(
                                f"reason={a['reason']!r}, expected {reason_trimmed!r}")
                        if a["old_notes"] is not None or a["new_notes"] is not None:
                            failures.append(
                                "status-only change must not record notes columns")
            finally:
                await browser.close()
    finally:
        if inserted_id:
            try:
                sb(f"/rest/v1/appointment_audit?appointment_id=eq.{inserted_id}",
                   method="DELETE")
                sb(f"/rest/v1/appointments?id=eq.{inserted_id}", method="DELETE")
            except Exception:
                pass
        delete_user(uid)

    if failures:
        print("❌ FAIL")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("✅ book_authorized_valid e2e passed "
          "(signed-in reception booking → row created, no stray audit; "
          "cancel via UI → single audit row with correct changed_by/old/new/reason)")


asyncio.run(main())
