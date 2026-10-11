# Git workflow

Adapted from [spencer-life/project-template](https://github.com/spencer-life/project-template)
and its `docs/git-workflow.md` at `d05b0d616cd1bbc4bcb7d12d822ce0ecc65393e3`.
This project uses the baseline's delivery/approval rules while replacing unrelated
application scaffolding with the checks appropriate to a dependency-free extension.

Track repository work in a GitHub issue. Use a focused branch from current main,
preserve unrelated/concurrent edits, and make coherent tested commits. Inspect
branch, base and current SHA before connector writes. Direct CLI/API/MCP routes
are interchangeable only when actually available and authorized. Credentials do
not grant authority to change protections or unrelated projects.

Run applicable syntax, unit, DOM/UI, native browser and package checks. Record the
exact tested revision and distinguish passed, failed, skipped and unavailable.
A simulated browser API is not a native test. The coding executor owns validation;
read-only review does not substitute for execution. Never bypass policies, required
checks, reviews, or access boundaries to make a check green.

Push useful checkpoints and create/update a focused PR, avoiding unnecessary CI
runs. Resolve review findings on the current head. KETA review and **specific user
approval identifying the repository, PR and exact head SHA** are required before
merging. General delivery requests, a green workflow, or an auto-merge capability
do not grant merge approval. A changed head needs renewed review/approval.

After authorized delivery, verify the actual merged revision, update/close its
issue only when acceptance is complete, and clean only completed branches. Do not
rewrite merged history, reset unrelated work, sweep branches by age, or leave a
watcher as a substitute for completion. Store publication, browser installation,
new deployment scope and permission expansion require their own authorization.

Current initial build: issue #1, branch `feature/1-design-capture`. Main was empty
and received only a bootstrap README before the feature branch was created.
The project remains public as supplied; this work does not change repository access.
