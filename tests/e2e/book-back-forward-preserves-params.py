"""
E2E: browser Back / Forward after a /doctors → /book deep-link jump.

Scenario:
  1. Start on /doctors (history entry #1).
  2. Navigate to /book?doctor=<id>&specialty=<id>&branch=<id> (history entry #2).
     Wait for step=5 to appear in the URL (URL-sync effect).
  3. Press browser Back → should land back on /doctors.
  4. Press browser Forward → should return to /book with:
       - doctor, specialty, branch params all intact
       - step present and NOT equal to 0 (must be 5, the derived deep-link step)
       - the "اختر التاريخ" (Date step) heading visible

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


def fetch_sample():
    doc = None
    for d in _rpc("list_public_doctors", {"_limit": 20, "_offset": 0}):
        if d.get("id") and d.get("specialty_id"):
            doc = d
            break
    if not doc:
        raise RuntimeError("no doctor with specialty found")
    branches = _rpc("list_public_branches", {})
    if not branches:
        raise RuntimeError("no branch found")
    return doc, branches[0]


async def main():
    doc, branch = fetch_sample()
    deep_link = (
        f"{BASE}/book"
        f"?doctor={doc['id']}"
        f"&specialty={doc['specialty_id']}"
        f"&branch={branch['id']}"
    )
    print("doctor:", doc["id"])
    print("specialty:", doc["specialty_id"])
    print("branch:", branch["id"])

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # 1) Land on /doctors so there's a real previous history entry.
        await page.goto(f"{BASE}/doctors", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")
        print("[1] on /doctors:", page.url)

        # 2) Jump to /book with the deep-link params and wait for step=5 sync.
        await page.goto(deep_link, wait_until="domcontentloaded")
        await page.wait_for_selector("text=اختر التاريخ", timeout=10_000)
        await page.wait_for_function(
            "window.location.search.includes('step=5')", timeout=5_000
        )
        forward_url = page.url
        for k, v in {
            "doctor": doc["id"],
            "specialty": doc["specialty_id"],
            "branch": branch["id"],
            "step": "5",
        }.items():
            if f"{k}={v}" not in forward_url:
                raise AssertionError(f"[2] missing {k}={v} in URL: {forward_url}")
        print("[2] deep-link resolved to step=5:", forward_url)

        # 3) Back → /doctors.
        await page.go_back(wait_until="domcontentloaded")
        await page.wait_for_function(
            "window.location.pathname === '/doctors'", timeout=5_000
        )
        print("[3] back on /doctors:", page.url)

        # 4) Forward → /book with all params preserved and step != 0.
        await page.go_forward(wait_until="domcontentloaded")
        await page.wait_for_function(
            "window.location.pathname === '/book'", timeout=5_000
        )
        # Give the URL-sync effect a beat in case history restore raced with it.
        await page.wait_for_selector("text=اختر التاريخ", timeout=10_000)
        restored = page.url
        print("[4] forward restored:", restored)

        for k, v in {
            "doctor": doc["id"],
            "specialty": doc["specialty_id"],
            "branch": branch["id"],
        }.items():
            if f"{k}={v}" not in restored:
                raise AssertionError(f"[4] Forward lost param {k}={v}: {restored}")

        if "step=0" in restored:
            raise AssertionError(f"[4] Forward regressed to step=0: {restored}")
        if "step=5" not in restored:
            raise AssertionError(f"[4] Forward missing step=5: {restored}")

        # Filter benign noise (missing assets, unrelated hydration mismatches).
        real = [
            e for e in errors
            if "Failed to load resource" not in e
            and "Hydration failed" not in e
            and "hydration" not in e.lower()
        ]
        if real:
            print("console/page errors:", real)
            raise AssertionError("unexpected errors on page")

        print("\nBack/Forward preserves deep-link params and step=5. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
