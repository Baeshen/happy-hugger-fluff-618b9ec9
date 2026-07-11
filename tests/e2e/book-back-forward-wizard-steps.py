"""
E2E: browser Back / Forward walks booking wizard steps without losing state.

Flow:
  1. Deep-link to /book?doctor=<id>&specialty=<id>&branch=<id>
     → wizard opens on step=5 (Date).
  2. Pick a date → wizard advances to step=6 (Time). URL PUSHES step=6.
  3. Press browser Back → URL returns to step=5, Date heading visible, and
     doctor / specialty / branch params still present. No step=0.
  4. Press browser Forward → URL returns to step=6, Time heading visible,
     with all deep-link params still present.
  5. The selected date is still highlighted after Back/Forward (state kept).

Exits non-zero on failure.
"""
import asyncio, os, sys, json, urllib.request, re
from datetime import date, timedelta
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


def assert_params_present(url, expected):
    for k, v in expected.items():
        if f"{k}={v}" not in url:
            raise AssertionError(f"missing {k}={v} in URL: {url}")


async def main():
    doc, branch = fetch_sample()
    deep_link = (
        f"{BASE}/book"
        f"?doctor={doc['id']}"
        f"&specialty={doc['specialty_id']}"
        f"&branch={branch['id']}"
    )
    core_params = {
        "doctor": doc["id"],
        "specialty": doc["specialty_id"],
        "branch": branch["id"],
    }

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # Fresh session — no stale draft.
        await page.goto(f"{BASE}/doctors", wait_until="domcontentloaded")
        await page.evaluate("() => sessionStorage.removeItem('booking:draft')")

        errors = []
        logs = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: (logs.append(m.text) if "[book]" in m.text else (errors.append(m.text) if m.type == "error" else None)))


        # 1) Deep-link → step=5.
        await page.goto(deep_link, wait_until="domcontentloaded")
        await page.wait_for_selector("text=اختر التاريخ", timeout=10_000)
        await page.wait_for_function(
            "window.location.search.includes('step=5')", timeout=5_000
        )
        step5_url = page.url
        assert_params_present(step5_url, {**core_params, "step": "5"})
        print("[1] on step=5:", step5_url)

        # 2) Pick a date button (any enabled day). The StepDate calendar
        # renders day buttons; grab the first non-disabled numeric-labeled
        # button inside the wizard card. Fall back: click any button that
        # has a day-number label 1–31.
        picked = False
        for i in range(1, 32):
            btn = page.locator(f"button:has-text('{i}'):not([disabled])").first
            try:
                if await btn.count() > 0 and await btn.is_visible():
                    await btn.click()
                    picked = True
                    break
            except Exception:
                continue
        if not picked:
            raise AssertionError("[2] could not find a selectable day on the calendar")

        # After picking, wizard advances to step 6 (Time). Wait for the URL
        # to reflect step=6 (pushed history entry).
        await page.wait_for_function(
            "window.location.search.includes('step=6')", timeout=8_000
        )
        step6_url = page.url
        assert_params_present(step6_url, {**core_params, "step": "6"})
        # StepTime heading — "اختر الوقت".
        await page.wait_for_selector("text=اختر الوقت", timeout=8_000)
        print("[2] advanced to step=6:", step6_url)

        # Capture selected date from sessionStorage draft to compare later.
        draft_after_pick = await page.evaluate(
            "() => JSON.parse(sessionStorage.getItem('booking:draft') || '{}')"
        )
        selected_date = draft_after_pick.get("date")
        if not selected_date:
            raise AssertionError("[2] draft.date is empty after picking a day")
        print("    selected date:", selected_date)

        # 3) Back → step=5.
        h_before = await page.evaluate("history.length")
        print("    history.length before Back:", h_before)
        await page.go_back()
        try:
            await page.wait_for_function(
                "window.location.search.includes('step=5') && window.location.pathname === '/book'",
                timeout=6_000,
            )
        except Exception:
            print("    URL after Back:", page.url)
            print("    history.length after Back:", await page.evaluate("history.length"))
            raise


        back_url = page.url
        if "step=0" in back_url:
            raise AssertionError(f"[3] Back regressed to step=0: {back_url}")
        assert_params_present(back_url, {**core_params, "step": "5"})
        await page.wait_for_selector("text=اختر التاريخ", timeout=8_000)
        # Draft still holds the selected date (state preserved).
        draft_back = await page.evaluate(
            "() => JSON.parse(sessionStorage.getItem('booking:draft') || '{}')"
        )
        if draft_back.get("date") != selected_date:
            raise AssertionError(
                f"[3] date lost after Back: {draft_back.get('date')} vs {selected_date}"
            )
        if draft_back.get("doctorId") != doc["id"]:
            raise AssertionError("[3] doctorId lost after Back")
        print("[3] Back → step=5, data preserved:", back_url)

        # 4) Forward → step=6, Time heading, params intact.
        await page.go_forward(wait_until="domcontentloaded")
        await page.wait_for_function(
            "window.location.search.includes('step=6')", timeout=5_000
        )
        fwd_url = page.url
        if "step=0" in fwd_url:
            raise AssertionError(f"[4] Forward regressed to step=0: {fwd_url}")
        assert_params_present(fwd_url, {**core_params, "step": "6"})
        await page.wait_for_selector("text=اختر الوقت", timeout=8_000)
        draft_fwd = await page.evaluate(
            "() => JSON.parse(sessionStorage.getItem('booking:draft') || '{}')"
        )
        if draft_fwd.get("date") != selected_date:
            raise AssertionError(
                f"[4] date lost after Forward: {draft_fwd.get('date')}"
            )
        print("[4] Forward → step=6, data preserved:", fwd_url)

        real = [
            e for e in errors
            if "Failed to load resource" not in e
            and "Hydration failed" not in e
            and "hydration" not in e.lower()
        ]
        if real:
            print("console/page errors:", real)
            raise AssertionError("unexpected errors on page")

        print("\nBack/Forward walks wizard steps and keeps state. ✅")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
