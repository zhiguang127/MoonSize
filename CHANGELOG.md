# Changelog

## 0.2.0 — local implementation, 2026-09-13

- Decode MoonBit v0 symbols using the pinned runtime grammar; retain raw names and mark unsupported symbols. Expose only explicitly encoded package labels.
- Move browser analysis to disposable Workers with transferable input, cancellation, stale-result protection and a 30-second timeout.
- Enforce shared input, section, function and metadata budgets in the MoonBit core; expose machine-readable resource errors and limits.
- Upgrade JSON schema to 2. **Breaking correction:** present optional values are scalars / objects, not single-element arrays; absent values remain null. Add function `symbol` metadata.
- Add pinned CommonMark and TOML case builds, reports, artifact hashes and upstream test logs. Verify an entity-table source optimization with 2,887 equal-output inputs across Wasm-GC and JS.
- Enable local Windows Native verification with an isolated MinGW compiler wrapper; keep official runtime sources unchanged.
- Extend Linux Actions to rebuild external cases and upload evidence. Remote execution and package publication are still pending.

## 0.1.0 — local prototype

- Pure MoonBit structural Wasm analysis, section comparisons, budgets, Node CLI, HTML reports and a local browser playground.
- Reproducible Wasm / Wasm-GC micro fixtures with stripped and named builds.
