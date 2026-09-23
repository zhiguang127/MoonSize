# Changelog

## 0.3.0 — unreleased

- Package an installable CLI candidate with a command entry and bundled MoonBit JS core; keep help and version available before core loading. Write JSON artifacts atomically and replace stale success results with error envelopes after path validation.
- Rebuild CommonMark/TOML with byte-bound provenance records, compressed policies and pass/fail evidence; add a single-artifact PR workflow template and a local PR-flow acceptance check.

- Add CLI `--json-file` so CI can save machine-readable results under output-path protection, including failed budget decisions and core parse errors; use it in the example workflow.

- Add CLI `--compress` whole-file gzip/Brotli measurements with fixed settings and recorded runtime versions; share inclusive budget decisions through MoonBit `check_size_budget` / `size_budget_json`.
- Add strict versioned policy files with independent raw/gzip/Brotli limits and optional build-condition requirements. Preserve raw budget compatibility while exposing a combined decision and exit status.
- Bind declared build conditions to artifact SHA-256 using `record`; distinguish matching, differing and unknown conditions without treating source revisions as build parameters.
- Append bounded, escaped CI Job Summaries with top regressions and matching coverage. Extend bilingual offline reports, demo records and the Actions evidence workflow; protect all output paths from input/configuration aliases.


- Upgrade analysis/comparison JSON to schema 3. Add symbol-owned package deltas, unique raw-name function matching, one-sided symbol and unresolved categories, and separate count/byte coverage for each build.
- Decode instruction framing for direct calls, tail calls and function references, including Wasm-GC and SIMD; inspect exports, start, table/global initializers and element segments. Preserve unresolved indirect/typed calls and explicit regional decode issues.
- Expose a bounded reference graph, callers/callees and a linear predecessor forest for inclusion paths; no dead-code or removable-size claims. Add the MoonBit `inclusion_path` API and CLI `--why INDEX`.
- Add searchable, paginated bilingual attribution reports and reference navigation in live and offline HTML. Fix missing i18n module routes in the preview server.
- Bound reference records and control nesting; add engine-validated fixtures, ambiguity and malformed-input regressions, resource-limit tests and real Worker coverage.

## 0.2.0 — local implementation, 2026-09-13

- Decode MoonBit v0 symbols using the pinned runtime grammar; retain raw names and mark unsupported symbols. Expose only explicitly encoded package labels.
- Move browser analysis to disposable Workers with transferable input, cancellation, stale-result protection and a 30-second timeout.
- Add a persistent Chinese / English switch for the browser UI and self-contained bilingual HTML reports.
- Enforce shared input, section, function and metadata budgets in the MoonBit core; expose machine-readable resource errors and limits.
- Upgrade JSON schema to 2. **Breaking correction:** present optional values are scalars / objects, not single-element arrays; absent values remain null. Add function `symbol` metadata.
- Add pinned CommonMark and TOML case builds, reports, artifact hashes and upstream test logs. Verify an entity-table source optimization with 2,887 equal-output inputs across Wasm-GC and JS.
- Enable local Windows Native verification with an isolated MinGW compiler wrapper; keep official runtime sources unchanged.
- Extend Linux Actions to rebuild external cases and upload evidence. The pinned workflow passed remotely on commit `4e10ce1`; package publication is still pending.

## 0.1.0 — local prototype

- Pure MoonBit structural Wasm analysis, section comparisons, budgets, Node CLI, HTML reports and a local browser playground.
- Reproducible Wasm / Wasm-GC micro fixtures with stripped and named builds.
