# Working on Design Lens

Follow docs/git-workflow.md and keep work items in docs/work/. This is a hosted,
dependency-free Manifest V3 extension; do not add telemetry, a backend,
CDN resources, a UI framework, or expanded permissions without explicit approval.
The user prefers graphite surfaces and solid or outlined controls with color on
actions, not tinted page backgrounds. Keep both light and dark themes accessible.

Read README.md and docs/ARCHITECTURE.md before changing behavior. Preserve source
provenance and label estimated/static reconstructions. Never promise original
React/Tailwind source from rendered DOM or infer screenshot fonts as observed CSS.
Treat page content as untrusted. No source HTML enters the extension UI as HTML.
Strip scripts, event handlers, form values and dangerous URLs from exports. Do not
inspect cookies, page storage, passwords, request headers or hidden application state.

Use npm run check, npm test, and npm run test:browser. The equivalent mise tasks
are supplied; do not claim an unavailable tool ran. Browser tests use Python
Playwright and a local Chromium executable, with no runtime production dependency.
Commit coherent validated progress on a focused branch, deliver a PR, and
record exact evidence. Publishing, store submissions and installing into the user's
browser are separate actions, not implied by producing an installation package.
Require specific user approval before merging. GitHub issue #1 tracks this build.
Repository: https://github.com/spencer-life/edge-design-capture.
Baseline: spencer-life/project-template at d05b0d616cd1bbc4bcb7d12d822ce0ecc65393e3.
