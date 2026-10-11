# 001 - Initial Design Lens build

Issue: https://github.com/spencer-life/edge-design-capture/issues/1
Branch: feature/1-design-capture
Status: implemented and packaged locally; the complete source is now in draft PR
#2. The original publication block below describes an earlier state. An intermediate
CI run failed the native activeTab fixture check; see docs/DELIVERY.md for the current
check summary. Do not merge without the specific approval required by
docs/git-workflow.md.

## Intent and decisions

Replace the fragile Safari-generated inspector with a desktop Chrome/Edge extension.
Use a native side panel, graphite/light themes, and solid/outlined colored actions.
Capture live DOM styles/components and observed tokens; treat screenshot references
as pixels, not original CSS/source. Export a complete bundle for Codex. No backend,
account, API key, runtime dependency, font download, or all-sites permission.

## Implementation

Inspector/picker, navigation/measurement, system scan, token provenance, palette/font/
asset inventories, sanitized HTML/CSS/static TSX, safe preview, screenshot/image
reference, Codex brief, ZIP export and local saves. Limits and deliberate omissions
are in README.md and docs/ARCHITECTURE.md. Runtime files are in extension/.

## Evidence and remaining gate

Run and record current-head checks in the PR. Local DOM/UI tests use explicitly
simulated browser transport because the available managed browser blocks extension
loading; that policy was left unchanged. The separate native CI suite is required
to validate actual installation, browser APIs and axe. No pass is implied by the
presence of the test file. Manual branded Edge/Chrome smoke and merge approval are
separate from Chromium test results. Keep the issue open until delivery is verified.
