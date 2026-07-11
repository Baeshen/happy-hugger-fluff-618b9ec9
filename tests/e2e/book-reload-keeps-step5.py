"""
E2E: reloading /book after a deep-link jump from /doctors with
`?doctor=&specialty=&branch=` must keep `step` in the URL matching the
actually rendered wizard step (date step = 5).

Scenario:
  1. /doctors
  2. /book?doctor=&specialty=&branch=  → resolves to step=5
  3. page.reload()                     → URL still has step=5, still on date step

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


async def expect_step5(page, label):
    await page.wait_for_selector("text=اختر التاريخ", timeout=10_000)
    await page.wait_for_function(
        "window.location.search.includes('step=5')", timeout=5_000
    )
    url = page.url
    print(f"[{label}]", url)
    if "step=0" in url:
        raise AssertionError(f"[{label}] regressed to step=0: {url}")
    if "step=5" not in url:
        raise AssertionError(f"[{label}] missing step=5: {url}")


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

        await page.goto(f"{BASE}/doctors", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")

        await page.goto(deep_link, wait_until="domcontentloaded")
        await expect_step5(page, "initial")

        # Reload twice — URL step must keep matching the rendered step.
        for i in (1, 2):
            await page.reload(wait_until="domcontentloaded")
            await expect_step5(page, f"reload-{i}")
            for k, v in {
                "doctor": doc["id"],
                "specialty": doc["specialty_id"],
                "branch": branch["id"],
            }.items():
                if f"{k}={v}" not in page.url:
                    raise AssertionError(f"[reload-{i}] lost {k}={v}: {page.url}")

        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("errors:", real)
            raise AssertionError("unexpected errors on /book")

        print("\nReload keeps URL step in sync with wizard step. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
