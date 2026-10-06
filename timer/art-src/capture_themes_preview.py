import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\Bobby\.gemini\antigravity\brain\e216b25a-5e3c-4e21-8a54-f851ed932f73"

async def capture_theme(page, theme_id, display_title):
    print(f"Capturing {theme_id} ({display_title})...")
    # Navigate to home
    await page.goto("http://localhost:8099/index.html")
    await page.wait_for_selector(".theme-grid")

    # Click the specific theme card
    card = await page.wait_for_selector(f".theme-card:has(img[src*='thumb_{theme_id}'])")
    await card.click()
    await page.wait_for_timeout(300)

    # We are on the picker screen! Pick 1m chip for quick demonstration
    chip_1m = await page.wait_for_selector(".chip[data-m='1']")
    await chip_1m.click()
    await page.wait_for_timeout(200)

    # Click START
    start_btn = await page.wait_for_selector("#btn-start")
    await start_btn.click()
    await page.wait_for_timeout(500)

    # 1. Early Start (Progress ~0.08)
    await page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"{theme_id}_01_start.png"))
    print(f"  Captured {theme_id}_01_start.png")

    # Fast forward: cycle to x10 speed (click ff 3 times)
    ff_btn = await page.wait_for_selector("#btn-ff")
    await ff_btn.click() # x2
    await page.wait_for_timeout(100)
    await ff_btn.click() # x5
    await page.wait_for_timeout(100)
    await ff_btn.click() # x10
    await page.wait_for_timeout(100)

    # 2. Mid stage (Progress ~0.40) - 1m timer at x10 takes 6 seconds total. 2.2s is ~0.37 progress
    await page.wait_for_timeout(2200)
    await page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"{theme_id}_02_mid.png"))
    print(f"  Captured {theme_id}_02_mid.png")

    # 3. Late stage (Progress ~0.85) - 2.5s more is ~0.80 progress
    await page.wait_for_timeout(2500)
    await page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"{theme_id}_03_late.png"))
    print(f"  Captured {theme_id}_03_late.png")

    # 4. Finale (Wait until timer hits 0:00, approx 1.6s more at x10)
    await page.wait_for_timeout(1600)
    # The clock hits 0:00, speed reverts to x1, finale begins!
    # Wait 800ms into the finale to capture peak action
    await page.wait_for_timeout(800)
    await page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"{theme_id}_04_finale.png"))
    print(f"  Captured {theme_id}_04_finale.png")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 420, "height": 720})
        page = await context.new_page()

        themes = [
            ("mech", "Gundam Assembly & Catapult Launch"),
            ("abyss", "Deep Sea Descent & Leviathan Chomp"),
            ("alchemy", "Chrono-Warp Reverse Earth & Big Bang"),
        ]

        for theme_id, display_title in themes:
            await capture_theme(page, theme_id, display_title)

        await browser.close()
        print("All screenshots successfully captured!")

if __name__ == "__main__":
    asyncio.run(main())
