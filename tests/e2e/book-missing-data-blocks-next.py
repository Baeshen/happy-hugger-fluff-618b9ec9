"""
E2E: /book must always render a valid step with clear guidance and MUST NOT
allow "Next" when required data is missing — even if the URL is tampered
with. `step=0` must never leak into the URL.

Cases:
  A. /book (no state)          → step=1, "اختر نوع الخدمة" visible, Next disabled.
  B. /book?step=4 (junk)       → clamped to step=1, Next still disabled.
  C. /book?step=8 (junk)       → clamped to step=1, Next still disabled.
  D. /book?branch=<real>&step=3 → branch known but specialty missing, wizard
                                  lands on the specialty step (3) with its
                                  prompt visible and Next disabled.

Exits non-zero on failure.
"""
import asyncio, os, sys, json, urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"


def _rpc(name, body):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/{name}",
        data=json.dumps(body).encode(),
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {SUPA_KEY}",
            "Content-Type": "application/json",
        },
    )
    return json.loads(urllib.request.urlopen(req).read())


def fetch_branch():
    b = _rpc("list_public_branches", {})
    if not b:
        raise RuntimeError("no branch found")
    return b[0]["id"]


async def next_button(page):
    # The Next / التالي button is the only enabled/disabled primary action
    # at the bottom of the wizard while step < 8.
    return page.get_by_role("button", name="التالي")


async def assert_step(page, expected_step, expected_prompt, label):
    await page.wait_for_selector(f"text={expected_prompt}", timeout=10_000)
    await page.wait_for_function(
        f"window.location.search.includes('step={expected_step}')",
        timeout=10_000,
    )
    url = page.url
    print(f"[{label}] {url}")
    if "step=0" in url:
        raise AssertionError(f"[{label}] step=0 leaked: {url}")
    if f"step={expected_step}" not in url:
        raise AssertionError(f"[{label}] expected step={expected_step}, got {url}")


async def assert_next_disabled(page, label):
    btn = await next_button(page)
    await btn.wait_for(timeout=5_000)
    disabled = await btn.is_disabled()
    if not disabled:
        raise AssertionError(f"[{label}] Next button should be disabled")
    # Force-click it anyway — nothing must happen (URL/step must not advance).
    before = page.url
    await btn.click(force=True)
    await page.wait_for_timeout(400)
    if page.url != before:
        raise AssertionError(
            f"[{label}] disabled Next changed URL: {before} → {page.url}"
        )


async def run_case(page, label, url, expected_step, expected_prompt):
    await page.evaluate("try { sessionStorage.clear(); } catch {}")
    await page.goto(url, wait_until="domcontentloaded")
    await assert_step(page, expected_step, expected_prompt, label)
    await assert_next_disabled(page, label)


async def main():
    branch = fetch_branch()

    cases = [
        ("fresh",         f"{BASE}/book",                     1, "اختر نوع الخدمة"),
        ("junk-step4",    f"{BASE}/book?step=4",              1, "اختر نوع الخدمة"),
        ("junk-step8",    f"{BASE}/book?step=8",              1, "اختر نوع الخدمة"),
        ("branch+step3",  f"{BASE}/book?branch={branch}&step=3", 3, "اختر التخصص"),
    ]

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors = []
        def maybe(kind, val):
            if "/book" in page.url:
                errors.append(f"{kind}: {val}")
        page.on("pageerror", lambda e: maybe("pageerror", str(e)))
        page.on("console",
                lambda m: maybe("console.error", m.text) if m.type == "error" else None)

        for label, url, step, prompt in cases:
            await run_case(page, label, url, step, prompt)

        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("errors:", real)
            raise AssertionError("unexpected errors on /book")

        print("\nWizard guides and blocks Next when data is missing. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
