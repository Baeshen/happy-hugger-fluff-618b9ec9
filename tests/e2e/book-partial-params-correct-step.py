"""
E2E: /book with only PART of the deep-link params (`doctor`, `specialty`,
`branch`) must never render `step=0` and must land on the correct step —
verified both in the URL AND in the visible step title.

For each case we assert:
  1. URL contains `step=<expected>` and NEVER `step=0`.
  2. The step-title prompt for `<expected>` is visible on screen (so URL
     and rendered UI agree, not just the URL).
  3. All partial params supplied are preserved in the URL.

Cases:
  - doctor only     → step=5, "اختر التاريخ" (specialty/branch auto-fill).
  - specialty only  → step=4, "اختر الطبيب".
  - branch only     → step=1, "اختر نوع الخدمة" (service still required).
  - branch + spec   → step=4, "اختر الطبيب".
  - spec + doctor   → step=5, "اختر التاريخ".

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


def fetch_ids():
    doc = next(
        (d for d in _rpc("list_public_doctors", {"_limit": 40, "_offset": 0})
         if d.get("id") and d.get("specialty_id")),
        None,
    )
    if not doc:
        raise RuntimeError("no doctor with specialty found")
    branches = _rpc("list_public_branches", {})
    if not branches:
        raise RuntimeError("no branch found")
    return doc["id"], doc["specialty_id"], branches[0]["id"]


STEP_PROMPTS = {
    1: "اختر نوع الخدمة",
    2: "اختر الفرع",
    3: "اختر التخصص",
    4: "اختر الطبيب",
    5: "اختر التاريخ",
}


async def run_case(page, label, url, expected_step, expected_params):
    await page.evaluate("try { sessionStorage.clear(); } catch {}")
    await page.goto(url, wait_until="domcontentloaded")

    prompt = STEP_PROMPTS[expected_step]
    # 1) Rendered UI matches expected step.
    await page.wait_for_selector(f"text={prompt}", timeout=10_000)
    # 2) URL is rewritten to match.
    await page.wait_for_function(
        f"window.location.search.includes('step={expected_step}')",
        timeout=10_000,
    )

    final = page.url
    print(f"[{label}] {final}")
    if "step=0" in final:
        raise AssertionError(f"[{label}] step=0 leaked: {final}")
    if f"step={expected_step}" not in final:
        raise AssertionError(f"[{label}] expected step={expected_step}, got {final}")
    for k, v in expected_params.items():
        if f"{k}={v}" not in final:
            raise AssertionError(f"[{label}] lost {k}={v}: {final}")


async def main():
    doctor, specialty, branch = fetch_ids()

    cases = [
        ("doctor-only",
         f"{BASE}/book?doctor={doctor}",
         5, {"doctor": doctor}),
        ("specialty-only",
         f"{BASE}/book?specialty={specialty}",
         4, {"specialty": specialty}),
        ("branch-only",
         f"{BASE}/book?branch={branch}",
         1, {"branch": branch}),
        ("branch+specialty",
         f"{BASE}/book?branch={branch}&specialty={specialty}",
         4, {"branch": branch, "specialty": specialty}),
        ("specialty+doctor",
         f"{BASE}/book?specialty={specialty}&doctor={doctor}",
         5, {"specialty": specialty, "doctor": doctor}),
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

        for label, url, step, params in cases:
            await run_case(page, label, url, step, params)

        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("errors:", real)
            raise AssertionError("unexpected errors on /book")

        print("\nPartial params → correct step, URL and UI agree, no step=0. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
