"""
E2E on /book: every validation / RLS failure must surface as a friendly
Arabic message and must NOT leak raw provider text (PostgREST error codes,
policy names, English DB verbiage, JSON blobs, URLs).

Cases:

  A. Short name  (1 char)        → Zod  → «الاسم قصير جدًا (٢ أحرف على الأقل)»
  B. Bad phone   (letters)       → Zod  → «رقم الهاتف يحتوي على أحرف غير مسموحة»
  C. Reason 501  (React setter)  → Zod  → «السبب طويل جدًا (الحد الأقصى 500 حرفًا)»
  D. RLS 42501   (past date via
     outgoing-request mutation)  → RLS  → «تعذر الحفظ. تأكد من الاسم والهاتف
                                            وأن التاريخ ليس في الماضي.»

For every case we also assert:
  - the expected Arabic toast text is visible in the sonner region
  - the toast text contains NO forbidden leak markers (English DB terms,
    Postgres codes, JSON braces, RLS/policy words, URLs)
  - no `appointments` row is created for the case's patient
  - no new `appointment_audit` row appears (baseline snapshot compared at end)

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/book_error_messages_arabic.py
"""
import asyncio, os, sys, time, json, re, urllib.request
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


def audit_count():
    rows = sb("/rest/v1/appointment_audit?select=id", method="GET") or []
    return len(rows)


# Substrings that must NEVER appear in a user-facing toast on /book.
# Case-insensitive. If any of these appear, the friendly-error map has a
# hole and raw provider text is leaking.
LEAK_MARKERS = [
    "row-level", "row level", "violates", "policy", "postgres", "pgrst",
    "23505", "23514", "42501", "constraint", "duplicate key",
    "supabase.co", "rest/v1", "http://", "https://", "PATCH ", "POST ",
    "column", "relation ", ".from(", '{"code', '"details"', '"hint"',
    "check_violation", "new row violates", "auth.uid", "public.appointments",
]


REACT_SET_VALUE_JS = r"""
(args) => {
  const el = document.querySelector(args.selector);
  if (!el) throw new Error('not found: ' + args.selector);
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
    await page.goto("http://localhost:8080/book", wait_until="networkidle")
    await page.wait_for_timeout(500)
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
    await page.wait_for_timeout(400)
    time_grid = card.locator("div.grid").nth(1)
    await time_grid.locator("button").first.wait_for(timeout=6000)
    await time_grid.locator("button").first.click()
    await page.wait_for_timeout(300)
    await page.locator('button:has-text("التالي")').click()
    await page.wait_for_timeout(300)


async def toast_texts(page):
    """Return the visible text of every currently-rendered sonner toast."""
    return await page.evaluate(r"""
      () => Array.from(document.querySelectorAll('[data-sonner-toast]'))
              .map(t => t.innerText.trim())
              .filter(Boolean)
    """)


def check_leak(label, texts, failures):
    joined = "\n".join(texts).lower()
    for marker in LEAK_MARKERS:
        if marker.lower() in joined:
            failures.append(
                f"[{label}] toast leaked forbidden marker {marker!r}: "
                f"{joined[:200]!r}"
            )


async def expect_toast(page, label, expected_substr, failures, timeout=4000):
    """Wait for expected Arabic text in the sonner region, then leak-check."""
    try:
        await page.get_by_text(expected_substr, exact=False).first.wait_for(
            timeout=timeout)
    except Exception:
        failures.append(
            f"[{label}] expected toast substring {expected_substr!r} not seen")
    texts = await toast_texts(page)
    if not any(expected_substr in t for t in texts):
        # Some cases render inline (not as toast); fall back to page body.
        body = (await page.locator("body").inner_text()).strip()
        if expected_substr not in body:
            failures.append(
                f"[{label}] {expected_substr!r} not present in toasts or body; "
                f"toasts={texts}")
        check_leak(label, [body], failures)
    else:
        check_leak(label, texts, failures)
    return texts


async def case_short_name(page, patient, failures):
    await advance_to_step4(page)
    await page.locator("input").nth(0).fill("ا")     # 1 char
    await page.locator("input").nth(1).fill("0501234567")
    await page.locator('button:has-text("تأكيد الحجز")').click()
    await page.wait_for_timeout(600)
    await page.screenshot(path=str(SHOTS / "err_short_name.png"))
    await expect_toast(page, "short-name", "الاسم قصير جدًا", failures)
    # No appointment row must exist for this attempt.
    rows = sb(f"/rest/v1/appointments?patient_name=eq.{patient}"
              "&select=id", method="GET") or []
    if rows:
        failures.append(f"[short-name] appointment created despite Zod reject: {rows}")


async def case_bad_phone(page, patient, failures):
    await advance_to_step4(page)
    await page.locator("input").nth(0).fill(patient)
    await page.locator("input").nth(1).fill("abc<>xyz@#!")
    await page.locator('button:has-text("تأكيد الحجز")').click()
    await page.wait_for_timeout(600)
    await page.screenshot(path=str(SHOTS / "err_bad_phone.png"))
    await expect_toast(page, "bad-phone", "رقم الهاتف يحتوي على أحرف غير مسموحة",
                       failures)
    rows = sb(f"/rest/v1/appointments?patient_name=eq.{patient}"
              "&select=id", method="GET") or []
    if rows:
        failures.append(f"[bad-phone] appointment created: {rows}")


async def case_long_reason(page, patient, failures):
    await advance_to_step4(page)
    await page.locator("input").nth(0).fill(patient)
    await page.locator("input").nth(1).fill("0501234567")
    await page.evaluate(REACT_SET_VALUE_JS,
                        {"selector": "textarea", "value": "س" * 501})
    await page.locator('button:has-text("تأكيد الحجز")').click()
    await page.wait_for_timeout(600)
    await page.screenshot(path=str(SHOTS / "err_reason_501.png"))
    await expect_toast(page, "reason-501", "السبب طويل جدًا", failures)
    rows = sb(f"/rest/v1/appointments?patient_name=eq.{patient}"
              "&select=id", method="GET") or []
    if rows:
        failures.append(f"[reason-501] appointment created: {rows}")


async def case_rls_past_date(page, patient, failures):
    """Zod is happy → the request reaches the DB → RLS WITH CHECK rejects
    the past date with 42501 → friendlyInsertError maps to Arabic."""
    async def rewrite(route, request):
        try:
            if "/rest/v1/appointments" in request.url and request.method == "POST":
                body = request.post_data or ""
                parsed = json.loads(body) if body else None
                past = time.strftime(
                    "%Y-%m-%d", time.gmtime(time.time() - 30 * 86400))
                def poke(o):
                    if isinstance(o, dict):
                        o["appointment_date"] = past
                if isinstance(parsed, list):
                    for x in parsed: poke(x)
                else:
                    poke(parsed)
                await route.continue_(post_data=json.dumps(parsed))
                return
        except Exception:
            pass
        await route.continue_()

    await page.route("**/rest/v1/appointments*", rewrite)
    try:
        await advance_to_step4(page)
        await page.locator("input").nth(0).fill(patient)
        await page.locator("input").nth(1).fill("0501234567")
        await page.locator('button:has-text("تأكيد الحجز")').click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "err_rls_past.png"))
        await expect_toast(
            page, "rls-past-date",
            "تعذر الحفظ. تأكد من الاسم والهاتف وأن التاريخ ليس في الماضي.",
            failures, timeout=6000)
        rows = sb(f"/rest/v1/appointments?patient_name=eq.{patient}"
                  "&select=id", method="GET") or []
        if rows:
            failures.append(f"[rls-past-date] appointment created: {rows}")
    finally:
        await page.unroute("**/rest/v1/appointments*")


async def main():
    stamp = int(time.time())
    patients = {
        "short-name":    f"ErrShort-{stamp}",
        "bad-phone":     f"ErrPhone-{stamp}",
        "reason-501":    f"ErrReason-{stamp}",
        "rls-past-date": f"ErrRLS-{stamp}",
    }
    failures: list[str] = []
    baseline_audit = audit_count()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        try:
            await case_short_name(page, patients["short-name"], failures)
            await case_bad_phone(page, patients["bad-phone"], failures)
            await case_long_reason(page, patients["reason-501"], failures)
            await case_rls_past_date(page, patients["rls-past-date"], failures)
        finally:
            await browser.close()

    # No case may have produced any audit row (all inserts either blocked
    # pre-flight by Zod or rejected by RLS).
    delta = audit_count() - baseline_audit
    if delta != 0:
        failures.append(
            f"appointment_audit gained {delta} row(s); expected 0 across all cases")

    # Belt-and-suspenders cleanup in case any patient did land in the table.
    for p in patients.values():
        rows = sb(f"/rest/v1/appointments?patient_name=eq.{p}"
                  "&select=id", method="GET") or []
        for r in rows:
            try:
                sb(f"/rest/v1/appointment_audit?appointment_id=eq.{r['id']}",
                   method="DELETE")
                sb(f"/rest/v1/appointments?id=eq.{r['id']}", method="DELETE")
            except Exception:
                pass

    if failures:
        print("❌ FAIL")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("✅ book_error_messages_arabic e2e passed "
          "(all 4 cases show correct Arabic text, no leaked provider markers, "
          "no rows created, no audit rows added)")


asyncio.run(main())
