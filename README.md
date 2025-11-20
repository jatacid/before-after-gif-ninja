# Before After Gif Ninja (Chrome Extension)

Create a looping before/after animated GIF by selecting two screenshots from the current page. Everything runs locally; no network APIs used.

## How it works

- Click the extension icon to open the Side Panel.
- Click "Select Image A" and drag a rectangle on the page to capture.
- Click "Select Image B" and capture the second area.
- Click "Build .gif" to generate an animated GIF with:
  1. A appears (hold 2s)
  2. 0.5s wipe left to B
  3. B appears (hold 2s)
  4. 0.5s wipe right to A
  5. Loops
- Copy to clipboard or download.
- Nothing is stored persistently.

## Install (Developer Mode)

1. Open Chrome → Extensions → Manage Extensions → Enable Developer Mode.
2. Click "Load unpacked" and select this folder.
3. Pin the extension. Click the icon to open the Side Panel UI.

## Notes

- The selection overlay supports Esc to cancel.
- The crop accounts for device pixel ratio for crisp captures.
- GIF generation uses a bundled copy of gif.js (MIT) with a worker.

## Files

- manifest.json — MV3 manifest
- background.js — handles side panel toggling and tab capture
- content/selector.js, selector.css — selection overlay injected into pages
- sidepanel/sidepanel.html|css|js — side panel UI and logic
- vendor/gif.js, gif.worker.js — offline GIF encoder

## Troubleshooting

- If capture fails, ensure "Allow access to file URLs" if needed and the active tab is not a restricted page (Chrome Web Store, chrome://, pdf viewer, etc.).
- Clipboard copy requires user gesture and Chrome permission; if it fails, download works as fallback.
