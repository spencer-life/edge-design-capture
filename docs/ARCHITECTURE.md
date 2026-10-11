# Architecture and security boundaries

## Runtime

`manifest.json` is Manifest V3. `background.js` owns the browser API boundary:
explicit active-tab access, isolated top-frame injection, allowlisted commands,
screenshot validation, and picker cleanup. No host permissions, externally
connectable messages, remote scripts, or broad background page scanning.

`content.js` performs bounded DOM/CSS inspection. The picker is the only injected
interface: a disposable closed-shadow outline and label. The persistent inspector
lives in `sidepanel.html/css/js`, isolated from webpage styling. The separate-window
mode is the same page with an explicit source-window identifier, not a second engine.

`lib/core.js` handles formatting, scoped token exports, static HTML/TSX, Codex briefs,
crop coordinates, URL validation, and local-library limits. `lib/images.js` decodes
local pixels, crops and samples colors. `lib/zip.js` creates dependency-free STORE ZIPs
with CRC32 and bounded file lists. No runtime package installation or bundler.

## Data model

A report uses schema `design-lens/report/v1`: source, selection, optional scan,
component, image reference, warnings, timestamp and version. Source URLs omit
credentials, query strings and fragments; useful asset URLs retain their query and
may contain sensitive values. Source document identity guards stale responses.
Scans are current-theme observations. Candidate token declarations are not presented
as verified cascade-winning rules. Image-derived colors are explicitly sampled.

No report is stored until Save is pressed. Chrome storage keeps the local library
and theme only. Reports can be downloaded or copied at the user's direction.
Selection changes clear the old component and selected-scope tokens; navigation
invalidates captures. Loading a saved snapshot cannot silently capture a different
live element. Pin measurements use document-coordinate snapshots, not live tracking.

## Untrusted page content

Use `textContent` and DOM methods, never page-supplied HTML in the inspector.
Component capture uses allowlisted tags/attributes and safe URLs, replaces form
controls, drops scripts/handlers and invisible HTML content, remaps fragment IDs,
and flattens accessible open-shadow/slot content. Generated class prefixes are
unique to each capture. Output is explicitly static and can require substantial
responsive/behavior reconstruction. Sanitization is defense in depth, not a claim
that arbitrary exported content can be trusted without review.

The preview iframe is sandboxed with no permissions. Its generated HTML has a
restrictive CSP with scripts, network, forms, objects and fonts disabled. The parent
allows local inline **styles** so captured CSS can render in the preview, but never
inline scripts or eval. Script execution remains extension-owned only. Exported
HTML blocks images except data/blob by default; external image loading is a separate
checkbox and a conscious privacy tradeoff. Downloaded standalone CSS/SVG/TSX should
still be reviewed before incorporation into another application.

Screenshot requests validate the active source tab, document identity, viewport and
scroll position. Region capture rejects movement after selecting. Browser screenshot
access is not simulated in production. No cookies/debugger/history/webRequest APIs.
The clipboard permission is write-only; the extension does not read your clipboard.

## Deliberate omissions

No screenshot-to-code model, subscription bypass, original framework/source recovery,
closed-shadow access, nested-frame traversal, font binaries, original animation
keyframe recovery, or auto-generated responsive behavior. No stitched full-page
screenshots. These boundaries keep the tool local, small, and truthful.
