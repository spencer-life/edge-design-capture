# Validation

## Fast checks

`npm run check` validates syntax, manifest paths/permissions, CSP and static safety
invariants. `npm test` uses Node's built-in runner for pure exports, browser-message
boundaries, screenshot guards, crop math, ZIP structure/CRC, and quota behavior.
The static security checks are not a formal security audit.

## DOM/UI harness

Install `requirements-dev.txt`, then `python3 -m playwright install chromium` and
`npm run test:browser`. `CHROMIUM_PATH` can explicitly select a permitted Chromium.
The test uses real rendering, computed CSS, DOM events, screenshots, image decoding,
clipboard-control UI and layout. Browser messaging, extension storage and clipboard
transport are deliberately simulated. It does **not** prove native extension install,
activeTab grants, native side-panel behavior, or real captureVisibleTab availability.
Results and screenshots go in ignored `test-results/`.

The build environment for this task had a managed Chromium policy that prohibited
loading extensions. That policy was not modified. Native installation was not run
there; test results must preserve this distinction.

## Native extension suite

Use a normal, unmanaged Linux test environment, Playwright's bundled Chromium,
`xdotool`, and Xvfb. The shipped manifest is loaded unchanged into a persistent
context. A real Alt+Shift+D keyboard shortcut invokes the extension action and grants
activeTab. The suite verifies the native side-panel target, then drives the same
inspector in its supported separate-window mode with real browser APIs. No test-only
host permission is added. Do not install an alternate browser or change an enterprise
policy to work around a managed environment restriction.

```sh
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install --with-deps chromium
# Install xdotool and xvfb with your distribution's package manager.
# axe is development-only and never bundled into the runtime extension.
npm install --prefix /tmp/design-lens-audit --ignore-scripts --no-package-lock axe-core@4.14.0
AXE_PATH=/tmp/design-lens-audit/node_modules/axe-core/axe.min.js \
  xvfb-run -a -s '-screen 0 1800x1200x24' python3 tests/native.py
```

The suite covers real selection, messaging, HTML/CSS/TSX export, screenshots, ZIP
files, storage, cancel/restored page interaction, and axe on four panels in both
themes. Axe passing does not prove complete accessibility; manually review focus,
keyboard picking, screen-reader usability and browser chrome. Keep a branded
Chrome/Edge installation smoke test separate from Chromium results.

## CI and evidence

The workflow tests the PR's exact head commit, not a synthetic merge revision. It
uses a read-only token, SHA-pinned Actions and test-only dependencies. It does not
publish a store release or merge. Download the validation artifact for machine-readable
results, screenshots, and package checksums. Consult the actual current-head check:
failed, skipped, pending and unavailable are not equivalent to passed.

`npm run package` creates deterministic extension and source ZIPs with checksums.
Use `DESIGN_LENS_REVISION=<tested Git commit>` only after matching source to that
revision. `BUILD-INFO.json` in the install package records the revision and SHA256
hash of each shipped runtime file. Keep the build info with your installation ZIP.

## Tool freshness

There are no npm/runtime dependencies. The local harness was validated with Node
22.16.0, Python Playwright 1.57.0, and permitted Chromium 144.0.7559.96. Playwright is
pinned as an explicit test-reproducibility choice rather than a claim of latest
version; review that pin before the next release. The first CI baseline uses the
latest verified Actions tags as of 2026-10-11 (checkout 7.0.1, setup-node 7.1.0,
upload-artifact 7.0.2) pinned by SHA, and axe-core 4.14.0. No update bot is assumed
installed. Dependency/security maintenance and store publication remain explicit work.
