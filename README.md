# 737 Light Reference

Pick a system, tap a light on its panel, and get what it means, what the QRH says, what the MEL allows,
and a short note on the system. Each part links into your own copy of the QRH, MEL or FCOM.
Works offline once installed on the iPad.

## Run it on your computer

Open the folder in VS Code and run a local server (service workers and ES modules need http, not `file://`).
If `data/lights.json` is in the folder, the app uses it directly:

    python3 -m http.server 8000

then open http://localhost:8000/

## Put it on GitHub Pages

1. Create a repository and push this folder to it, with `index.html` at the top level.
2. Repository Settings, Pages, "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Open the address GitHub gives you. All paths are relative, so it works under `/repo-name/`.

`*.pdf` and `data/` are in `.gitignore`, so neither the manuals nor the light data (which is derived from
them) are pushed by accident. Check with `git status` before the first commit. GitHub Pages sites are
public even when the repository is private, so the app code is public. The light data is not.

## Install on the iPad

1. Open the GitHub Pages address in Safari.
2. Share, then Add to Home Screen.
3. Open it from the Home Screen icon. The first screen asks for the light data: choose `lights.json` from Files
   (AirDrop or iCloud Drive it across first).
4. Tap Manuals and choose the QRH, MEL and FCOM PDFs from Files.

The installed app keeps its own storage, separate from Safari. Load the data and PDFs again inside the installed
app, even if you loaded them in Safari first. After that, everything works with no signal.
Clearing Safari website data removes the stored data and PDFs, so keep the originals in Files.

## Updating

- Light data lives in `data/lights.json` on your computer only. To update the iPad, send the new file
  across and use Manuals, Light data, Replace file. Keep a private backup of the file.
- Code changes: push and the app fetches new files straight away when online. When offline or on a slow
  connection it uses the saved copy.
- If you add or rename a file, add it to `SHELL` in `sw.js` and change `VERSION` there.

## How links work

Each reference stores a bookmark title (for example "STANDBY RUDDER ON") and the page it had when it was
checked. The viewer looks the title up in your PDF's bookmarks and opens that page, then you can scroll on
through the document. If a revision renames a bookmark, the viewer says so and uses the saved page.

## Layout

    index.html            page shell
    css/app.css           styles (fonts are local, in fonts/)
    js/app.js             screens: systems, panel, light detail
    js/viewer.js          manual viewer (continuous scroll)
    js/motion.js          open/close transitions between the systems and a panel
    js/plain.js           plain-English MEL breakdown block
    js/pdfdocs.js         opens PDFs, finds pages from bookmarks
    js/store.js           keeps your PDFs and light data in the browser
    sw.js                 offline cache
    data/lights.json      systems, panels and lights (not in git; loaded onto the device)
    tools/dump_outlines.py   list a PDF's bookmarks and pages
    tools/make_icons.py      regenerate the app icons
    vendor/pdfjs/         pdf.js 3.11.174