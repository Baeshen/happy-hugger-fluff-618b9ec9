"""
E2E: from the reception admin UI, attempting to change an appointment's
status to a "requires reason" status (cancelled / no_show) with a prompt
that returns whitespace-only text (incl. \\n \\t NBSP) must:

  1. show the toast «السبب مطلوب لهذا الإجراء»
  2. NOT invoke the update server function (no network call)
  3. leave appointment.status unchanged in the DB
  4. NOT create any appointment_audit row

Covers both the "إلغاء" (→ cancelled) and "لم يحضر" (→ no_show) buttons,
each with several whitespace variants (spaces, \\t, \\n, NBSP, mixed).

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/status_change_ws_reason.py
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

def status_of(aid):
    r = sb(f"/rest/v1/appointments?id=eq.{aid}&select=status", method="GET")
    return r[0]["status"] if r else None

def audit_count(aid):
    r = sb(f"/rest/v1/appointment_audit?appointment_id=eq.{aid}&select=id", method="GET")
    return len(r or [])

async def sign_in(page, email, password):
    await page.goto("http://localhost:8080/auth", wait_until="networkidle")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/admin", timeout=15000)
    await page.wait_for_timeout(800)
    # Move to "المواعيد" tab (the reception surface)
    await page.get_by_text("المواعيد", exact=True).first.click()
    await page.wait_for_timeout(1200)

# (name, prompt-return string) — every value normalizes to '' in JS + DB.
WS_INPUTS = [
    ("spaces",   "     "),
    ("tabs",     "\t\t"),
    ("newlines", "\n\n"),
    ("NBSP",     "\u00A0\u00A0"),
    ("mixed",    "  \n\t\u00A0  "),
]

# Buttons that require a reason. Each entry: (button-label, DB status name).
DESTRUCTIVE = [
    ("إلغاء",   "cancelled"),
    ("لم يحضر", "no_show"),
]

async def main():
    stamp = int(time.time())
    uid, email, pwd = create_user(f"e2e-status-ws-{stamp}@test.local", "reception")
    failures: list[str] = []
    ids: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # Track any server-fn POSTs so we can assert NO call is made on rejection.
        fn_calls: list[str] = []
        page.on("request", lambda req: (
            fn_calls.append(req.url)
            if req.method == "POST" and "_serverFn" in req.url else None))

        try:
            # Seed appointments; the DB trigger `force_appointment_defaults`
            # sanitizes anonymous inserts to status='new'. We then promote each
            # row to 'confirmed' via service-key SQL so both "إلغاء" and
            # "لم يحضر" buttons render on the row.
            plan: list[tuple[str, str, str, str, str, str]] = []
            # (label, db_status, ws_name, ws_raw, patient, aid)
            for label, db_status in DESTRUCTIVE:
                for ws_name, ws_raw in WS_INPUTS:
                    patient = f"WS-{db_status}-{ws_name}-{stamp}"
                    aid = new_appt(patient); ids.append(aid)
                    # Promote to 'confirmed' (bypasses force_appointment_defaults,
                    # which is BEFORE INSERT only). This UPDATE fires the audit
                    # trigger with an empty reason and a non-required status,
                    # producing one baseline audit row we account for below.
                    sb(f"/rest/v1/appointments?id=eq.{aid}",
                       method="PATCH", body={"status": "confirmed"})
                    plan.append((label, db_status, ws_name, ws_raw, patient, aid))

            await sign_in(page, email, pwd)
            first_patient = plan[0][4]
            await page.locator("tr", has_text=first_patient).last.wait_for(timeout=10000)

            for (label, db_status, ws_name, ws_raw, patient, aid) in plan:
                # Baseline snapshot BEFORE the click.
                status_before = status_of(aid)
                audit_before = audit_count(aid)

                js_literal = json.dumps(ws_raw)
                await page.evaluate(f"() => {{ window.prompt = () => {js_literal}; }}")

                row = page.locator("tr", has_text=patient).last
                try:
                    await row.wait_for(timeout=8000)
                except Exception:
                    failures.append(f"[{db_status}/{ws_name}] row not visible")
                    continue

                btn = row.get_by_role("button", name=label)
                if await btn.count() == 0:
                    failures.append(
                        f"[{db_status}/{ws_name}] '{label}' button missing on row "
                        f"(status_before={status_before})")
                    continue

                fn_calls.clear()
                await btn.first.click()

                # (1) toast «السبب مطلوب لهذا الإجراء»
                toast = page.get_by_text("السبب مطلوب لهذا الإجراء").first
                try:
                    await toast.wait_for(timeout=4000)
                except Exception:
                    failures.append(
                        f"[{db_status}/{ws_name}] toast «السبب مطلوب لهذا الإجراء» not shown")

                await page.wait_for_timeout(500)

                # (2) no server-fn call
                if fn_calls:
                    failures.append(
                        f"[{db_status}/{ws_name}] server fn was invoked "
                        f"{len(fn_calls)}× (expected 0)")

                # (3) status must NOT change from its pre-click value
                status_after = status_of(aid)
                if status_after != status_before:
                    failures.append(
                        f"[{db_status}/{ws_name}] status changed "
                        f"{status_before} → {status_after}")

                # (4) no NEW audit row (compare against baseline)
                audit_after = audit_count(aid)
                if audit_after != audit_before:
                    failures.append(
                        f"[{db_status}/{ws_name}] audit rows grew "
                        f"{audit_before} → {audit_after}")

                await page.wait_for_timeout(1200)

            await page.screenshot(path=str(SHOTS / "status_ws_final.png"))
        finally:
            await browser.close()

    # cleanup
    for aid in ids:
        try: sb(f"/rest/v1/appointments?id=eq.{aid}", method="DELETE")
        except Exception: pass
    delete_user(uid)

    total = len(DESTRUCTIVE) * len(WS_INPUTS)
    if failures:
        print(f"❌ {len(failures)} failure(s) across {total} attempts")
        for f in failures: print(" -", f)
        sys.exit(1)
    print(f"✅ status_change_ws_reason: all {total} attempts rejected with the expected toast, "
          f"no status changes, no audit rows")

asyncio.run(main())
