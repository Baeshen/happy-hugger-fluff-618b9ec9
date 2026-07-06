"""
E2E on /book: the `reason` textarea must accept a 500-char reason and reject
a 501-char reason (Zod .max(500), mirroring REASON_MAX in src/lib/reason.ts
and the DB normalize_reason cap).

Both submissions are pushed through the same public booking flow, and we
bypass the <textarea maxLength=500> attribute via the React-native value
setter so the form state actually holds 500 / 501 characters — otherwise the
browser would silently truncate at 500 and both cases would look identical.

Assertions:

  ACCEPT (500 chars):
    - success screen «رقم الحجز …» appears
    - exactly ONE appointments row exists for the patient
    - row.reason length == 500 and content matches
    - status='new', notes=NULL (public booking invariants)
    - 0 appointment_audit rows for this appointment

  REJECT (501 chars):
    - Arabic error toast «السبب طويل جدًا …» appears
    - success screen does NOT appear
    - 0 appointments rows for the patient
    - 0 NEW appointment_audit rows created during the whole test window
      (baseline snapshot taken before the run, compared after)

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/book_reason_500_501.py
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


# React tracks input state via its own value tracker; setting `el.value = ...`
# directly doesn't fire React's onChange. The native-setter+input-event dance
# is the standard workaround for React-controlled inputs.
REACT_SET_VALUE_JS = r"""
(args) => {
  const el = document.querySelector(args.selector);
  if (!el) throw new Error('textarea not found: ' + args.selector);
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, args.value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return { length: el.value.length };
}
"""


async def advance_to_step4(page):
    """Walk the public booking flow through steps 1–3, stop on step 4."""
    await page.goto("http://localhost:8080/book", wait_until="networkidle")
    await page.wait_for_timeout(600)
    card = page.locator("div.rounded-2xl").first
    await card.wait_for(timeout=8000)
    await card.get_by_role("button", name="الأطفال", exact=True).click()
    await page.wait_for_timeout(200)
    await page.locator('button:has-text("التالي")').click()

    await page.wait_for_timeout(300)
    await card.get_by_role("button", name="أي طبيب متاح", exact=True).click()
    await page.wait_for_timeout(200)
    await page.locator('button:has-text("التالي")').click()

    await page.wait_for_timeout(500)
    date_grid = card.locator("div.grid").first
    await date_grid.locator("button").first.wait_for(timeout=8000)
    await date_grid.locator("button").first.click()
    await page.wait_for_timeout(500)
    time_grid = card.locator("div.grid").nth(1)
    await time_grid.locator("button").first.wait_for(timeout=6000)
    await time_grid.locator("button").first.click()
    await page.wait_for_timeout(300)
    await page.locator('button:has-text("التالي")').click()
    await page.wait_for_timeout(400)


async def fill_and_submit(page, patient, phone, reason_text, shot_prefix):
    await page.locator("input").nth(0).fill(patient)
    await page.locator("input").nth(1).fill(phone)

    # Force the reason value past the maxLength=500 attribute via React's
    # native value setter, so the form state actually holds `len(reason_text)`.
    res = await page.evaluate(
        REACT_SET_VALUE_JS,
        {"selector": "textarea", "value": reason_text},
    )
    actual_len = res["length"]

    await page.screenshot(path=str(SHOTS / f"{shot_prefix}_before_submit.png"))
    await page.locator('button:has-text("تأكيد الحجز")').click()
    await page.wait_for_timeout(1500)
    await page.screenshot(path=str(SHOTS / f"{shot_prefix}_after_submit.png"))
    return actual_len


def audit_count():
    rows = sb(
        "/rest/v1/appointment_audit?select=id", method="GET") or []
    return len(rows)


async def main():
    stamp = int(time.time())
    patient_ok = f"BookReason500-{stamp}"
    patient_bad = f"BookReason501-{stamp}"
    phone = "0501234567"
    reason_500 = "ص" * 500
    reason_501 = "س" * 501
    failures = []
    inserted_ids: list[str] = []

    baseline_audit = audit_count()

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            try:
                # --- ACCEPT: 500-char reason ---
                await advance_to_step4(page)
                len500 = await fill_and_submit(
                    page, patient_ok, phone, reason_500, "book_reason_500")
                if len500 != 500:
                    failures.append(
                        f"[500] textarea value length={len500}, expected 500 "
                        "(React setter bypass failed)")

                # Success screen must appear
                try:
                    await page.get_by_text("رقم الحجز", exact=False).first.wait_for(
                        timeout=8000)
                except Exception:
                    failures.append("[500] booking-success screen never appeared")

                rows = sb(
                    f"/rest/v1/appointments?patient_name=eq.{patient_ok}"
                    "&select=id,status,notes,reason", method="GET") or []
                if len(rows) != 1:
                    failures.append(
                        f"[500] expected 1 appointment row, got {len(rows)}")
                else:
                    r = rows[0]
                    inserted_ids.append(r["id"])
                    if r["status"] != "new":
                        failures.append(
                            f"[500] status={r['status']!r}, expected 'new'")
                    if r["notes"] is not None:
                        failures.append(
                            f"[500] notes={r['notes']!r}, expected NULL")
                    if r["reason"] is None or len(r["reason"]) != 500:
                        failures.append(
                            f"[500] db reason length="
                            f"{len(r['reason']) if r['reason'] else 0}, "
                            "expected 500")
                    elif r["reason"] != reason_500:
                        failures.append("[500] db reason content mismatch")
                    a = sb(
                        f"/rest/v1/appointment_audit?appointment_id=eq.{r['id']}"
                        "&select=id", method="GET") or []
                    if a:
                        failures.append(
                            f"[500] fresh booking must not create audit, got {len(a)}")

                # --- REJECT: 501-char reason ---
                # Fresh page walk-through — form state is scoped to the page.
                await advance_to_step4(page)
                len501 = await fill_and_submit(
                    page, patient_bad, phone, reason_501, "book_reason_501")
                if len501 != 501:
                    failures.append(
                        f"[501] textarea value length={len501}, expected 501")

                # Success screen must NOT appear; toast with Arabic error must.
                try:
                    await page.get_by_text("السبب طويل جدًا", exact=False).first.wait_for(
                        timeout=4000)
                except Exception:
                    failures.append(
                        "[501] expected Arabic «السبب طويل جدًا» toast never appeared")
                if await page.get_by_text("رقم الحجز", exact=False).count() > 0:
                    failures.append(
                        "[501] booking-success screen appeared — 501 was NOT rejected")

                bad_rows = sb(
                    f"/rest/v1/appointments?patient_name=eq.{patient_bad}"
                    "&select=id", method="GET") or []
                if bad_rows:
                    failures.append(
                        f"[501] expected 0 appointment rows, got {len(bad_rows)}")
                    for br in bad_rows:
                        inserted_ids.append(br["id"])
            finally:
                await browser.close()

        # Global check: audit table must NOT have gained any row (accept case
        # was an INSERT, reject case was blocked pre-flight — neither can
        # legitimately produce an appointment_audit row).
        post_audit = audit_count()
        if post_audit != baseline_audit:
            failures.append(
                f"appointment_audit gained {post_audit - baseline_audit} row(s); "
                "expected 0 new rows across both 500 and 501 attempts")
    finally:
        for aid in inserted_ids:
            try:
                sb(f"/rest/v1/appointment_audit?appointment_id=eq.{aid}",
                   method="DELETE")
                sb(f"/rest/v1/appointments?id=eq.{aid}", method="DELETE")
            except Exception:
                pass

    if failures:
        print("❌ FAIL")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("✅ book_reason_500_501 e2e passed "
          "(reason=500 accepted → row created, reason=501 rejected pre-flight; "
          "no new appointment_audit rows in either case)")


asyncio.run(main())
