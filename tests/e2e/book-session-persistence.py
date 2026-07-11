"""
E2E: booking wizard state persists across page refresh via sessionStorage.

Flow:
  1. Open /book, complete steps 1-3 (service → branch → specialty).
  2. Read sessionStorage['booking:draft'] and assert it contains selections.
  3. Reload the page (F5).
  4. Assert same step + selections are restored (heading, draft still there).

Exits non-zero on failure.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
STORAGE_KEY = "booking:draft"


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(f"{BASE}/book", wait_until="domcontentloaded")

        # Step 1 — service type: pick "عيادات تخصصية"
        await page.wait_for_selector("text=عيادات تخصصية", timeout=10_000)
        await page.get_by_text("عيادات تخصصية", exact=False).first.click()
        await page.wait_for_timeout(150)

        # Step 2 — branch: pick first branch card
        await page.wait_for_selector("text=اختر الفرع", timeout=10_000)
        first_branch = page.locator("button").filter(
            has=page.locator("div.font-semibold")
        ).first
        branch_label = (await first_branch.inner_text()).strip().split("\n")[0]
        await first_branch.click()
        await page.wait_for_timeout(150)

        # Step 3 — specialty: pick first tile
        await page.wait_for_selector("text=اختر التخصص", timeout=10_000)
        first_spec = page.locator("button").filter(
            has=page.locator("div.font-semibold")
        ).first
        spec_label = (await first_spec.inner_text()).strip().split("\n")[0]
        await first_spec.click()
        await page.wait_for_timeout(300)

        # We should now be on step 4 (اختر الطبيب)
        await page.wait_for_selector("text=اختر الطبيب", timeout=10_000)

        draft_before = await page.evaluate(
            f"() => window.sessionStorage.getItem({json.dumps(STORAGE_KEY)})"
        )
        if not draft_before:
            raise AssertionError("sessionStorage['booking:draft'] not set")
        parsed = json.loads(draft_before)
        print("draft before reload:", {
            "step": parsed.get("step"),
            "serviceType": parsed.get("serviceType"),
            "branchId": parsed.get("branchId"),
            "specialtyId": parsed.get("specialtyId"),
        })
        if parsed.get("step") != 4:
            raise AssertionError(f"expected step=4 before reload, got {parsed.get('step')}")
        if not parsed.get("branchId") or not parsed.get("specialtyId") or not parsed.get("serviceType"):
            raise AssertionError(f"missing selections in draft: {parsed}")

        # Reload the page
        await page.reload(wait_until="domcontentloaded")

        # Same step heading should render after hydration
        await page.wait_for_selector("text=اختر الطبيب", timeout=10_000)
        await page.wait_for_timeout(200)

        draft_after = await page.evaluate(
            f"() => window.sessionStorage.getItem({json.dumps(STORAGE_KEY)})"
        )
        parsed_after = json.loads(draft_after)
        if parsed_after.get("step") != 4:
            raise AssertionError(f"expected step=4 after reload, got {parsed_after.get('step')}")
        for k in ("serviceType", "branchId", "specialtyId"):
            if parsed_after.get(k) != parsed.get(k):
                raise AssertionError(
                    f"selection '{k}' not restored: before={parsed.get(k)} after={parsed_after.get(k)}"
                )

        print(f"[ok] step 4 restored ({branch_label} / {spec_label})")

        real = [e for e in errors if "Failed to load resource" not in e]
        if real:
            print("errors:", real)
            raise AssertionError("unexpected errors")

        print("\nAll persistence checks passed.")
        await browser.close()


try:
    asyncio.run(main())
except Exception as e:
    print("FAIL:", e)
    sys.exit(1)
