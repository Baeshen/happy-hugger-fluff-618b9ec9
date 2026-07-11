"""
E2E: /book must never leak `step=0` into the URL when one or more of
`doctor` / `specialty` / `branch` deep-link params are missing.

The wizard should clamp to the highest step whose prerequisites are met
(maxReachableStep) and rewrite the URL accordingly.

Coverage:
  - /book                        → step=1 (nothing selected)
  - /book?branch=B               → step=3 (specialty next)
  - /book?specialty=S            → step=4 (doctor next)
  - /book?branch=B&specialty=S   → step=4
  - /book?doctor=D               → step=5 (date next, specialty auto-filled)
  - /book?step=8 (junk)          → snaps back to step=1

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


async def check(page, label, url, expected_step):
    """Navigate and assert URL resolves to `step=<expected_step>` (never 0)."""
    # Clear session draft so previous cases don't pollute this one.
    await page.evaluate("try { sessionStorage.clear(); } catch {}")
    await page.goto(url, wait_until="domcontentloaded")
    # Wait for wizard to resolve. Every reachable step ≥1 eventually rewrites
    # the URL to include step=<n>.
    await page.wait_for_function(
        f"window.location.search.includes('step={expected_step}')",
        timeout=10_000,
    )
    final = page.url
    print(f"[{label}] {final}")
    if "step=0" in final:
        raise AssertionError(f"[{label}] step=0 leaked: {final}")
    if f"step={expected_step}" not in final:
        raise AssertionError(
            f"[{label}] expected step={expected_step}, got {final}"
        )


async def main():
    doctor, specialty, branch = fetch_ids()

    cases = [
        ("no-params",      f"{BASE}/book",                                       1),
        ("branch-only",    f"{BASE}/book?branch={branch}",                       3),
        ("specialty-only", f"{BASE}/book?specialty={specialty}",                 4),
        ("branch+spec",    f"{BASE}/book?branch={branch}&specialty={specialty}", 4),
        ("doctor-only",    f"{BASE}/book?doctor={doctor}",                       5),
        ("junk-step8",     f"{BASE}/book?step=8",                                1),
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

        for label, url, expected in cases:
            await check(page, label, url, expected)

        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("errors:", real)
            raise AssertionError("unexpected errors on /book")

        print("\nPartial-params never produce step=0. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
