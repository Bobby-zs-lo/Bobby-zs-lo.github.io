import asyncio
import os
import io
from PIL import Image
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\Bobby\.gemini\antigravity\brain\e216b25a-5e3c-4e21-8a54-f851ed932f73"

async def record_theme_finale(page, theme_id):
    print(f"Recording finale GIF for {theme_id}...")
    await page.goto("http://localhost:8099/index.html")
    await page.wait_for_selector(".theme-grid")

    # Click card
    card = await page.wait_for_selector(f".theme-card:has(img[src*='thumb_{theme_id}'])")
    await card.click()
    await page.wait_for_timeout(300)

    # 1m chip
    chip_1m = await page.wait_for_selector(".chip[data-m='1']")
    await chip_1m.click()
    await page.wait_for_timeout(200)

    # Click START
    start_btn = await page.wait_for_selector("#btn-start")
    await start_btn.click()
    await page.wait_for_timeout(400)

    # Fast forward x10
    ff_btn = await page.wait_for_selector("#btn-ff")
    await ff_btn.click()
    await page.wait_for_timeout(50)
    await ff_btn.click()
    await page.wait_for_timeout(50)
    await ff_btn.click()
    await page.wait_for_timeout(50)

    # Wait until just before 0:00 (approx 5.6s under x10)
    await page.wait_for_timeout(5700)

    # Now capture 24 consecutive frames spanning ~2.4 seconds of the finale
    frames = []
    for _ in range(24):
        png_bytes = await page.screenshot()
        img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        # Resize to 240x411 for crisp compact animated GIF
        img_small = img.resize((240, int(240 * (img.height / img.width))), Image.Resampling.LANCZOS)
        frames.append(img_small)
        await page.wait_for_timeout(100)

    gif_path = os.path.join(ARTIFACTS_DIR, f"{theme_id}_finale.gif")
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=100,
        loop=0,
        optimize=True
    )
    print(f"  Wrote {gif_path}")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 420, "height": 720})
        page = await context.new_page()

        for theme in ["mech", "abyss", "alchemy"]:
            await record_theme_finale(page, theme)

        await browser.close()
        print("All finale GIFs successfully generated!")

if __name__ == "__main__":
    asyncio.run(main())
