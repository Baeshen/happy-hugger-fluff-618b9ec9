"""
E2E: deep-link params on /book

Verifies that navigating to /book with doctor + specialty (+ optional branch)
lands directly on the Date step (5) with all params preserved in the URL,
matching the behavior of the "احجز موعد" button on /doctors cards.

Cases:
  1. /book?doctor=<id>&specialty=<id>              → step 5 (Date)
  2. /book?doctor=<id>&specialty=<id>&branch=<id>  → step 5, branch retained

Exits non-zero on failure.
"""
import asyncio, os, sys, json, urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"


def fetch_sample_doctor():
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/list_public_doctors",
        data=json.dumps({"_limit": 10, "_offset": 0}).encode(),
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {SUPA_KEY}",
            "Content-Type": "application/json",
        },
    )
    for d in json.loads(urllib.request.urlopen(req).read()):
        if d.get("id") and d.get("specialty_id"):
            return d
    raise RuntimeError("no doctor with specialty found")


def fetch_sample_branch():
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/list_public_branches",
        data=b"{}",
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {SUPA_KEY}",
            "Content-Type": "application/json",
        },
    )
    rows = json.loads(urllib.request.urlopen(req).read())
    if not rows:
        raise RuntimeError("no branch found")
    return rows[0]


async def assert_deep_link(page, url, expected_params):
    await page.goto(url, wait_until="domcontentloaded")
    # wait for step heading
    await page.wait_for_selector("text=اختر التاريخ", timeout=10_000)
    final = page.url
    for k, v in expected_params.items():
        if f"{k}={v}" not in final:
            raise AssertionError(f"missing {k}={v} in URL: {final}")
    if "step=5" not in final:
        raise AssertionError(f"expected step=5 in URL, got: {final}")
    print(f"[ok] {url}\n     → {final}")


async def main():
    doc = fetch_sample_doctor()
    br = fetch_sample_branch()
    print(f"doctor id={doc['id']} specialty={doc['specialty_id']}")
    print(f"branch id={br['id']}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # Case 1: doctor + specialty
        await assert_deep_link(
            page,
            f"{BASE}/book?doctor={doc['id']}&specialty={doc['specialty_id']}",
            {"doctor": doc["id"], "specialty": doc["specialty_id"]},
        )

        # Case 2: doctor + specialty + branch
        await assert_deep_link(
            page,
            f"{BASE}/book?doctor={doc['id']}&specialty={doc['specialty_id']}&branch={br['id']}",
            {"doctor": doc["id"], "specialty": doc["specialty_id"], "branch": br["id"]},
        )

        # Filter out benign 404 asset noise if any
        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("console/page errors:", real)
            raise AssertionError("unexpected errors on page")

        print("\nAll deep-link checks passed.")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
