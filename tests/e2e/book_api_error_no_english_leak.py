"""
E2E on /book: for EVERY realistic PostgREST error the anon insert could
produce, the toast MUST show ONE of the fixed Arabic strings from
FRIENDLY_INSERT_MESSAGES (src/lib/insert-errors.ts), and NO English token
from the fabricated PostgREST body — message, details, hint, or code —
may appear anywhere on the page.

Strategy: intercept the outgoing POST to /rest/v1/appointments with
Playwright's `page.route` and fulfill it with a fabricated response body
containing rich English `message` / `details` / `hint`. Then submit a valid
booking and assert:

  1. A sonner toast appears whose text equals the expected fixed Arabic.
  2. The full page body text (post-submit) contains none of the English
     tokens from the fabricated `message`, `details`, `hint`, or `code`
     (≥ 4 alpha chars, case-insensitive) — no PostgREST leakage anywhere,
     even outside the toast region.
  3. No `appointments` row is created (we short-circuited the request).

Cases cover every code the friendlyInsertError() mapping handles:
  42501 → rls, 23505 → duplicate, 23514 → check, 22001 → check,
  23502 → missing, 23503 → reference, 22P02 → invalid, XX999 → unknown.

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/book_api_error_no_english_leak.py
"""
import asyncio, os, sys, time, json, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

URL = os.environ["SUPABASE_URL"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Kept in sync with src/lib/insert-errors.ts. If a value changes there this
# test must fail loudly.
FRIENDLY = {
    "duplicate": "الموعد محجوز مسبقًا. اختر وقتًا آخر.",
    "rls":       "تعذر الحفظ. تأكد من الاسم والهاتف وأن التاريخ ليس في الماضي.",
    "check":     "بيانات غير مقبولة. راجع الحقول ثم حاول مرة أخرى.",
    "missing":   "بيانات ناقصة. رجاءً املأ الحقول المطلوبة ثم حاول مرة أخرى.",
    "reference": "قيمة مرجعية غير صالحة. تأكد من الاختيارات ثم حاول مرة أخرى.",
    "invalid":   "قيمة غير صالحة في أحد الحقول. راجع المدخلات ثم حاول مرة أخرى.",
    "unknown":   "حدث خطأ غير متوقع أثناء الحفظ.",
}

# Fabricated PostgREST error bodies. Each one carries English text designed
# to be caught by the leak assertion if any of it reaches the DOM.
# HTTP status roughly mirrors what Supabase returns; friendlyInsertError
# reads `code` from the JSON body regardless.
CASES = [
    dict(label="42501-rls",   http=403, expect="rls",       body={
        "code": "42501", "message": 'new row violates row-level security policy for table "appointments"',
        "details": "Failing row contains (fake).",
        "hint": "Grant additional privileges or adjust policy for table appointments",
    }),
    dict(label="23505-dup",   http=409, expect="duplicate", body={
        "code": "23505", "message": 'duplicate key value violates unique constraint "appointments_slot_key"',
        "details": "Key (doctor_id, appointment_date, appointment_time)=(...) already exists.",
        "hint": "Choose a different appointment time",
    }),
    dict(label="23514-check", http=400, expect="check",     body={
        "code": "23514", "message": 'new row for relation "appointments" violates check constraint "patient_name_length"',
        "details": "Failing row contains a short patient_name.",
        "hint": "Provide a longer patient_name",
    }),
    dict(label="22001-len",   http=400, expect="check",     body={
        "code": "22001", "message": "value too long for type character varying(120)",
        "details": None, "hint": "Shorten the input to satisfy column length",
    }),
    dict(label="23502-null",  http=400, expect="missing",   body={
        "code": "23502", "message": 'null value in column "patient_name" of relation "appointments" violates not-null constraint',
        "details": "Failing row contains (null, ...).",
        "hint": "Provide a non-null patient_name value",
    }),
    dict(label="23503-fk",    http=409, expect="reference", body={
        "code": "23503", "message": 'insert or update on table "appointments" violates foreign key constraint "appointments_specialty_id_fkey"',
        "details": 'Key (specialty_id)=(00000000-0000-0000-0000-000000000000) is not present in table "specialties".',
        "hint": "Provide an existing specialty_id",
    }),
    dict(label="22P02-uuid",  http=400, expect="invalid",   body={
        "code": "22P02", "message": 'invalid input syntax for type uuid: "not-a-uuid-at-all"',
        "details": None, "hint": "Provide a valid uuid value",
    }),
    dict(label="XX999-unk",   http=500, expect="unknown",   body={
        "code": "XX999", "message": "surprise internal server condition happened here",
        "details": "Everything is on fire in postgres today",
        "hint": "Try again later or contact support",
    }),
]


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


def english_tokens(*strings):
    """Extract alpha tokens (≥ 4 chars) from provider text — the substrings
    that would be user-visible if we ever interpolated raw text."""
    import re
    out = set()
    for s in strings:
        if not isinstance(s, str):
            continue
        for t in re.split(r"[^A-Za-z]+", s):
            if len(t) >= 4:
                out.add(t.lower())
    return out


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


async def run_case(page, case, patient, failures):
    label = case["label"]
    expected = FRIENDLY[case["expect"]]

    async def fulfiller(route, request):
        if "/rest/v1/appointments" in request.url and request.method == "POST":
            await route.fulfill(
                status=case["http"],
                headers={"Content-Type": "application/json"},
                body=json.dumps(case["body"]),
            )
            return
        await route.continue_()

    await page.route("**/rest/v1/appointments*", fulfiller)
    try:
        await advance_to_step4(page)
        await page.locator("input").nth(0).fill(patient)
        await page.locator("input").nth(1).fill("0501234567")
        await page.locator('button:has-text("تأكيد الحجز")').click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / f"api_leak_{label}.png"))

        # 1) Correct Arabic toast/text on the page.
        try:
            await page.get_by_text(expected, exact=False).first.wait_for(timeout=6000)
        except Exception:
            failures.append(f"[{label}] expected Arabic {expected!r} not seen")

        # 2) No English tokens from message/details/hint/code leak anywhere.
        forbidden = english_tokens(
            case["body"].get("message"),
            case["body"].get("details"),
            case["body"].get("hint"),
            case["body"].get("code"),
        )
        # Prune tokens that legitimately occur in the app chrome (page title,
        # nav, meta). We only care about strings unique to provider text.
        SAFE = {"http", "https", "html", "body", "root", "main", "form", "type",
                "text", "true", "false", "null", "link", "next", "prev", "role",
                "aria", "data", "book", "home", "user"}
        forbidden -= SAFE
        body_text = (await page.locator("body").inner_text()).lower()
        leaks = sorted(t for t in forbidden if t in body_text)
        if leaks:
            failures.append(
                f"[{label}] page leaked forbidden tokens {leaks}")

        # 3) No row actually created (we short-circuited the request).
        rows = sb(
            f"/rest/v1/appointments?patient_name=eq.{patient}"
            "&select=id", method="GET") or []
        if rows:
            failures.append(f"[{label}] unexpected row created: {rows}")
    finally:
        await page.unroute("**/rest/v1/appointments*")


async def main():
    stamp = int(time.time())
    failures: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        try:
            for i, case in enumerate(CASES):
                patient = f"ApiLeak-{case['label']}-{stamp}-{i}"
                await run_case(page, case, patient, failures)
        finally:
            await browser.close()

    if failures:
        print("❌ FAIL")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print(f"✅ book_api_error_no_english_leak e2e passed "
          f"({len(CASES)} cases: fixed Arabic shown, no PostgREST text leaked)")


asyncio.run(main())
