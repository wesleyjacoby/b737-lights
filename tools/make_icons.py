"""Render the app icons with Playwright. Run from the project folder: python3 tools/make_icons.py"""
import pathlib
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
tmpl = (root / "tools" / "icon.html").as_uri()
jobs = [("icon-192.png", 192, .66), ("icon-512.png", 512, .66), ("icon-maskable-512.png", 512, .5), ("apple-touch-icon.png", 180, .66)]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, size, k in jobs:
        pg = b.new_page(viewport={"width": size, "height": size})
        pg.goto(f"{tmpl}?s={size}&k={k}")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(root / "icons" / name))
        pg.close()
    b.close()
print("icons written")
