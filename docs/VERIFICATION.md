# Design Lens - final verification report

Date: 2026-10-11

**Status: installable local build candidate, not a fully verified native release.**
The full source is supplied in the source ZIP. GitHub publication and native testing
remain blocked as described below.

## Exact source and packages

Tested **local** Git revision: `998689ff61bd561edfa0e7d118455ad6466a8677`. This revision is not published to GitHub.
The local working tree was clean after the checks. BUILD-INFO.json in the install ZIP
records this revision and hashes of all 13 shipped runtime files.
Each runtime file was byte-compared with the tested source. Every tracked source
file was byte-compared with the source ZIP (37 entries).

| Package | SHA256 |
| --- | --- |
| edge-design-capture-1.0.0.zip | `001c741c94613137deaa522a4d7b3895b6d172405a78071cba5efd1423b287c5` |
| edge-design-capture-1.0.0-source.zip | `a0776f34be430c7fd883c7ae361204c2d2737db901e1b56f8a14a0b64b6d69dc` |

## Passed

- Syntax/static checks: 11 JavaScript files, Python syntax, MV3 manifest, file paths,
  explicit permissions, DOM IDs/labels, CSP and selected safety invariants.
- **32 Node unit tests**, including exports, URL handling, crop math, source-tab/
  navigation/movement guards, message allowlists, library quotas, ZIP CRC and
  control/action contrast. These use mocks where browser APIs are involved.
- **25 browser workflow checks** in real Chromium rendering with an explicitly
  simulated extension API transport. Selection/cancel/navigation, sanitized
  component HTML/CSS/static TSX, tokens/scopes, palette/font/asset views, searches,
  saved snapshots, text omission, open-shadow/slot content, image-reference labels,
  rendered PNG cropping/import/palette, ZIP downloading/CRC, keyboard tab behavior,
  layouts at 300/360/420/600 pixels, accessible button names, and restored interaction.
- Light and dark UI screenshots generated and reviewed during development.
- ZIP integrity, complete runtime/source inclusion, no bundled font files, and
  deterministic packaging: two consecutive builds produced identical SHA256s.

Test tools: Node 22.16.0, Python Playwright 1.57.0, permitted Chromium 144.0.7559.96.
The runtime extension itself has no external dependencies or services.

## Not run / not delivered

**Native extension install and browser-API integration: NOT RUN.** The available
managed browser prohibits loading extensions. That policy was not modified, and
no alternate browser was installed to evade it. The DOM/UI harness is not a
substitute for actual activeTab permission grants, native side-panel behavior,
captureVisibleTab, storage and clipboard integration.

**Axe: NOT RUN.** Accessible names, keyboard tabs, control/action contrast and
layout were checked, but this is not an axe result or a full accessibility audit.
The full source includes a separate native test and a read-only CI workflow for
these checks in a permitted test environment. Their existence does not imply a pass.
Branded Edge/Chrome installation smoke tests and store publication were not performed.

**GitHub publication: BLOCKED.** Issue #1 and `feature/1-design-capture` exist in
`spencer-life/edge-design-capture`. The remote branch was verified to remain at
bootstrap README revision `090e241585c4eda09bd3e9e4a9ada0030c7035e9`.
The connector blocked the content-engine write because it could not determine its
safety status. The blocked request was not retried by another route. Accepted
foundation objects were not attached as a broken partial application. There is no
complete implementation PR, native CI run, release or merge to report.

## Use and limits

Extract the installation ZIP, enable Developer mode at `edge://extensions` or
`chrome://extensions`, and Load unpacked the `edge-design-capture` folder containing
manifest.json in a browser/profile that permits it. From the full source ZIP,
load its `extension/` folder. No npm install/build is required for the runtime.

Live DOM captures are static, viewport-specific reconstructions; they do not recover
original framework logic, all responsive rules or hidden paid source. Mobbin/image
references are pixels with sampled colors, not extracted fonts/tokens. Review visible
text, screenshot pixels and asset URLs before sharing. No font files are exported.

The unresolved gates are authorized source publication, actual native/axe testing,
and specific approval before any merge. Do not treat this package as end-to-end
verified merely because the local checks pass.
