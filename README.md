# Design Lens

**Build status:** locally tested installation candidate. Native extension and axe
validation remain unverified; source publication to GitHub was blocked by the
connector. See `docs/DELIVERY.md` for the exact delivery boundary.

A local-first design capture extension for **desktop Chrome and Microsoft Edge**.
The repository is `spencer-life/edge-design-capture`; the name in your browser is
**Design Lens**. No account, server, API key, subscription, or runtime dependency.

## Install

1. Extract `edge-design-capture-1.0.0.zip` into a permanent folder. Do not load the ZIP itself.
2. Open `edge://extensions` in Edge or `chrome://extensions` in Chrome.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted
   **edge-design-capture** folder containing `manifest.json`.
4. Pin **Design Lens** in the browser toolbar. Open a normal website and click its
   icon, or press **Alt+Shift+D**. The inspector opens in the browser side panel.

From this source repository, select the **extension/** folder in step 3; there is
no application build or npm install step. Keep the folder in place after installing.
Use the extension's Reload button on the extensions page after replacing its files,
then refresh the website. Export saved references before removing the extension.

This is an unpacked development distribution, not a Chrome Web Store or Edge
Add-ons listing. Use a browser/profile that permits developer extensions. Do not
change an organization-managed installation policy to install it.

## The two workflows

### A real website or live component demo

**Pick element → Parent (as needed) → Capture component → Scan page →
Download complete bundle.**

Pick a card, button, heading, or section. Parent/child/sibling controls help choose
its full container. Inspect typography, colors, box model, flex/grid, surfaces,
transitions, and semantics. Click a value to copy it. Pin one element as reference
A to measure horizontal/vertical gaps against another.

Scan page gathers the current page's observed tokens, color palette, font stacks,
spacing, radii, shadows, and asset references. Root and selected-scope variables
remain separate. Search the results or copy/download a category. The optional
Eyedropper is shown only when the browser provides it.

**Copy for Codex** produces a structured reconstruction brief with the captured
HTML/CSS, observed system, provenance, and limits. It is not a hosted AI service.
Paste it into your coding assistant and attach the PNG when using an image.

### Mobbin, a screenshot gallery, canvas, or an image reference

Use **Capture → Select area**, **Visible page**, **Element**, or import an image.
Save/copy the resulting PNG and its locally sampled palette. The brief explicitly
labels the design inside the image as a visual reconstruction, not extracted CSS.
The CSS of a gallery's image container is not the pictured application's styling.

Screenshots capture the **visible viewport**, not a stitched full page. An element
partly outside the viewport is cropped to the visible portion. Scrolling/resizing
while capturing cancels the request rather than silently misaligning the crop.

## What's included

| Tool | Result |
| --- | --- |
| Inspector | Computed styles, dimensions, layout, typography, motion metadata and HTML semantics |
| System scan | Actual CSS variables with scope and candidate definitions; colors, font inventory and observed scales |
| Component capture | Sanitized static HTML + CSS, static React TSX, and a script-free preview |
| Assets | Image/background URLs and sanitized inline SVGs; no font files |
| Image reference | Viewport/element/region PNG, imported images, and a sampled palette |
| Exports | Individual CSS/HTML/TSX/JSON files, a Codex brief, or one complete ZIP |
| Saved references | Named snapshots stored only in this browser profile; JSON export and explicit removal |
| Interface | Native side panel or separate inspector window, light/dark themes, colored solid/outlined actions, keyboard tabs |

The complete ZIP includes the applicable `rebuild-brief.md`, `design-report.json`,
`captured.html`, `captured.css`, `CapturedComponent.tsx`, `tokens.css`, `tokens.json`,
and `reference.png`. Pair the TSX with its CSS. Tailwind is a reconstruction target
for the brief, not a claim that original Tailwind classes were recovered.

## Privacy and practical limits

Access is granted by clicking the extension on a tab. There is no always-on
all-websites permission, telemetry, network client, backend, or automatic upload.
The extension does not read cookies, password values, page storage, request headers,
or private application state. Live text, screenshots, CSS variables and asset URLs
can still contain private information: review exports before sharing them.

Component exports remove scripts, event handlers, embedded documents, form values,
and unsafe URLs. Preview scripts and external requests are blocked. Exported HTML
also blocks external images by default; enable the explicit checkbox only when
appropriate. Asset URLs may expire or carry query parameters. Use designs/assets
only where you have permission. Source font files are never downloaded or bundled.

Rendered DOM does not expose original React logic, Figma variables, all responsive
breakpoints, inactive states, or hidden paid source. Component output is a static,
viewport-specific starting point. Font stacks are observed; the exact font used
for each glyph is not asserted. Closed shadow roots and embedded frames are not
traversed; open a frame's actual page separately to inspect it.

Safety limits: 2,400 scanned elements, 450 captured component elements, 12,000 CSS
rules, 900 token names, 160 assets, and roughly 1.2 MB per component export. Partial
results are labeled. Local saves allow 16 entries, 900 KB per entry and 6 MB total;
full-library errors never silently delete an older capture. Image imports are
limited to 12 MB/32 MP and resized to a maximum 2,560 px edge. ZIP exports are
limited to 16 MB. Download a large reference instead of trying to save it locally.

## Troubleshooting

- **Can't connect:** activate the website and click the toolbar icon again. Browser
  settings, store pages, and other restricted pages cannot be inspected. For local
  HTML, explicitly enable **Allow access to file URLs** in the extension details.
- **Picker seems stuck:** press **Esc**, use **Stop**, or close the inspector. It
  also stops automatically after two minutes or when the source tab changes.
- **Clipboard blocked:** the export is selected in the panel; press Ctrl+C/Cmd+C,
  or download the file. Keep the inspector window focused when copying.
- **Missing styling in preview:** external images/fonts are deliberately blocked.
  Review the accompanying CSS and load only licensed assets in your own project.
- **Too much data:** select a smaller component or use an image reference. Partial
  capture warnings are meaningful, not a guarantee of a complete recreation.

## Develop and verify

Node 22+ and Python 3.11+ are sufficient for source checks and packaging.
`npm test` has no installation step. Browser tests require the test-only Python
Playwright dependency. See [testing](docs/TESTING.md),
[architecture](docs/ARCHITECTURE.md), and [workflow](docs/git-workflow.md).

```sh
npm run check
npm test
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
npm run test:browser
npm run package
```

Read the test report's mode: the DOM/UI harness is not a native extension install.
The native CI test separately loads the shipped manifest, opens the actual side
panel, exercises browser APIs, and runs axe. A failing or unavailable native test
must not be described as passed. Manual branded Chrome/Edge smoke testing remains
useful even after Chromium CI passes.

References: [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab),
[Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel),
[Edge sidebar](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar),
[Playwright extension testing](https://playwright.dev/python/docs/chrome-extensions).
