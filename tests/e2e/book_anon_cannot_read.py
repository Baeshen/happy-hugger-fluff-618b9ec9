"""
E2E: from the /book page (an anonymous route), evaluate a Supabase read of
`appointments` in the browser context. The staff-only SELECT policy MUST
return zero rows to anon even though rows exist in the table.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/book_anon_cannot_read.py
"""
import asyncio, os, sys, time, json, urllib.request, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

URL = os.environ["SUPABASE_URL"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)


def sb(path, method="GET", body=None):
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


async def main():
    stamp = int(time.time())
    probe = f"AnonReadProbe-{stamp}"
    # Seed a fresh row via service role so we know at least ONE row exists.
    tomorrow = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 86400))
    seeded = sb("/rest/v1/appointments", method="POST", body={
        "patient_name": probe,
        "patient_phone": "0500000000",
        "appointment_date": tomorrow,
        "appointment_time": "10:00",
        "status": "new",
    })
    seeded_id = seeded[0]["id"] if seeded else None
    failures = []

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await (await browser.new_context(
                viewport={"width": 1280, "height": 1800})).new_page()
            await page.goto("http://localhost:8080/book", wait_until="networkidle")
            await page.wait_for_timeout(500)

            # Run the read inside the anon page context — reuses the browser
            # supabase client that /book already loaded (publishable key).
            result = await page.evaluate(f"""
                async () => {{
                    const mod = await import('/src/integrations/supabase/client.ts');
                    const sb = mod.supabase;
                    // 1) Try to read the specific row we know exists.
                    const targeted = await sb.from('appointments')
                        .select('id, patient_name')
                        .eq('patient_name', {json.dumps(probe)});
                    // 2) Try a broad list read as well.
                    const broad = await sb.from('appointments')
                        .select('id').limit(50);
                    return {{
                        targeted: {{ data: targeted.data, err: targeted.error?.message ?? null }},
                        broad: {{ count: broad.data?.length ?? null, err: broad.error?.message ?? null }},
                    }};
                }}
            """)
            await page.screenshot(path=str(SHOTS / "book_anon_read.png"))
            await browser.close()

        # anon MUST see 0 rows for both queries (staff-only SELECT policy).
        t = result["targeted"]
        b = result["broad"]
        if not isinstance(t["data"], list) or len(t["data"]) != 0:
            failures.append(
                f"targeted read leaked rows to anon: {t['data']!r} (err={t['err']!r})")
        if b["count"] not in (0, None) and b["count"] != 0:
            failures.append(
                f"broad read leaked {b['count']} rows to anon (err={b['err']!r})")
        # Sanity: confirm the seeded row IS visible to service role.
        q = urllib.parse.quote(probe, safe="")
        svc_check = sb(f"/rest/v1/appointments?patient_name=eq.{q}&select=id")
        if not svc_check or len(svc_check) != 1:
            failures.append(
                f"seed sanity failed: service_role saw {len(svc_check or [])} rows for {probe!r}")
    finally:
        if seeded_id:
            try: sb(f"/rest/v1/appointments?id=eq.{seeded_id}", method="DELETE")
            except Exception: pass

    if failures:
        print("❌ FAIL")
        for f in failures: print(" -", f)
        sys.exit(1)
    print("✅ book_anon_cannot_read e2e passed "
          "(anon sees 0 rows for both targeted and broad SELECT on appointments)")

asyncio.run(main())
