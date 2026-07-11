"""
E2E: navigating to the booking wizard from /doctors with a doctor that has a
specialty AND a branch must ALWAYS resolve the URL to `step=5` — never
`step=0` and never an entry that omits `step`.

Mirrors the URL shape produced by DoctorCard.tsx / doctor-detail Book links
(`/book?doctor=&specialty=&branch=`).

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
    return doc, branches[0]


async def main():
    doc, branch = fetch_sample()
    deep_link = (
        f"{BASE}/book"
        f"?doctor={doc['id']}"
        f"&specialty={doc['specialty_id']}"
        f"&branch={branch['id']}"
    )

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors = []
        def maybe(kind, val):
            if "/book" in page.url:
                errors.append(f"{kind}: {val}")
        page.on("pageerror", lambda e: maybe("pageerror", str(e)))
        page.on("console", lambda m: maybe("console.error", m.text) if m.type == "error" else None)

        # 1) Load /doctors listing (entry point for the booking journey).
        await page.goto(f"{BASE}/doctors", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")

        # 2) SPA-navigate to the /book deep link — same shape DoctorCard emits.
        await page.goto(deep_link, wait_until="domcontentloaded")

        # 3) Wizard must resolve to the date step and rewrite the URL to
        #    include step=5 (never step=0, never omitted).
        await page.wait_for_selector("text=اختر التاريخ", timeout=10_000)
        await page.wait_for_function(
            "window.location.search.includes('step=5')", timeout=5_000
        )

        url = page.url
        print("landed:", url)
        if "step=0" in url:
            raise AssertionError(f"step=0 leaked into URL: {url}")
        if "step=5" not in url:
            raise AssertionError(f"missing step=5 in URL: {url}")

        for k, v in {
            "doctor": doc["id"],
            "specialty": doc["specialty_id"],
            "branch": branch["id"],
        }.items():
            if f"{k}={v}" not in url:
                raise AssertionError(f"missing {k}={v} in {url}")

        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("errors:", real)
            raise AssertionError("unexpected errors on /book")

        print("\nBooking link from /doctors resolves to step=5. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
