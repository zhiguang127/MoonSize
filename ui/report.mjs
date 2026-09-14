const format = new Intl.NumberFormat('en-US');
export const bytes = n => `${format.format(n)} B`;
export const signed = n => `${n > 0 ? '+' : ''}${bytes(n)}`;
export const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const label = s => s.id === 0 ? `custom · ${s.custom_name || '(empty name)'}` : s.label;

export const styles = `
:root{color-scheme:light;--ink:#17222e;--muted:#5d6d7e;--line:#dae2e7;--blue:#2563eb;--green:#117c63;--red:#b93842}
*{box-sizing:border-box}body{margin:0;background:#f3f6f9;color:var(--ink);font:15px/1.55 system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:42px 28px 64px}h1,h2,p{margin:0}h1{font-size:42px;letter-spacing:-2px;line-height:1.15}h2{font-size:18px;letter-spacing:-.3px}
.topline{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:36px}.brand{font-weight:800;letter-spacing:-.5px;font-size:20px}.brand span{color:var(--blue)}
.badge{display:inline-flex;border:1px solid var(--line);border-radius:30px;padding:5px 12px;font-size:12px;font-weight:650;background:white}.intro{max-width:720px;color:var(--muted);margin-top:14px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:750;color:var(--muted);margin-bottom:8px}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}.metric,.panel{background:white;border:1px solid var(--line);border-radius:15px;padding:24px;min-width:0}.metric strong{font-size:32px;letter-spacing:-1px;display:block;margin:7px 0}.muted{color:var(--muted)}.small{font-size:12px}.up{color:var(--red)}.down{color:var(--green)}
.layout{display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:start}.panelhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.stack{display:flex;width:100%;height:16px;border-radius:6px;overflow:hidden;margin:20px 0}.stack span{min-width:0}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:700}td,th{padding:12px 6px;border-bottom:1px solid #ecf0f3;text-align:right;vertical-align:top}td:first-child,th:first-child{text-align:left;overflow-wrap:anywhere}td:first-child{max-width:230px}td:not(:first-child),th:not(:first-child){white-space:nowrap}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}code{font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}.note{padding:14px 16px;border:1px solid var(--line);border-radius:10px;margin:16px 0;color:var(--muted);font-size:12px;background:#f8fafc}.warnings{border-color:#edcc9c;background:#fff9ef;color:#795425}.foot{margin-top:24px;color:var(--muted);font-size:12px}.files{overflow-wrap:anywhere;margin-top:12px}.controls{margin:28px 0;padding:24px;background:white;border:1px solid var(--line);border-radius:15px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.controls label{font-size:13px;font-weight:650;display:block}.controls input{display:block;max-width:100%;margin-top:8px}.controls input[type=number]{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px;font:inherit}.actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;grid-column:1/-1}button{border:0;border-radius:8px;background:var(--blue);color:white;font:600 13px system-ui;padding:11px 18px;cursor:pointer}button:disabled{opacity:.45;cursor:wait}button.secondary{background:#eaf0ff;color:#214caa}#status{color:var(--muted);font-size:13px}input:focus-visible,button:focus-visible{outline:3px solid #88acff;outline-offset:3px}
@media(max-width:800px){main{padding:24px 16px}.layout{grid-template-columns:1fr}.metrics{grid-template-columns:1fr}.controls{grid-template-columns:1fr}h1{font-size:34px}.topline{margin-bottom:24px}.metric strong{font-size:28px}}`;

export function renderBody(result, files = {}) {
  const a = result.analysis ?? result.after;
  const d = result.comparison;
  const budget = result.budget;
  const palette = ['#2563eb','#17a398','#f5a94d','#7e6ce0','#67a2d0','#c86d95','#6e8b61'];
  const sections = a.sections.toSorted((x,y) => y.total_bytes - x.total_bytes || x.offset - y.offset);
  const sectionKey = s => `${s.id}:${s.custom_name ?? ''}`;
  const colors = new Map();
  for (const s of sections) if (!colors.has(sectionKey(s))) colors.set(sectionKey(s), palette[colors.size % palette.length]);
  const color = s => colors.get(sectionKey(s)) ?? '#9aa9b8';
  const allRows = d ? d.sections.toSorted((x,y) => Math.abs(y.delta_bytes)-Math.abs(x.delta_bytes)) : sections;
  const rows = allRows.slice(0,100);
  const functionRows = a.functions.toSorted((x,y) => y.total_bytes-x.total_bytes || x.ordinal-y.ordinal).slice(0,15);
  const warnings = [...(result.before?.warnings ?? []).map(w => `Before: ${w}`), ...a.warnings.map(w => `${d ? 'After: ' : ''}${w}`)];
  const sizeClass = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
  return `<div class="topline"><div class="brand">◔ Moon<span>Size</span></div><span class="badge">MOONBIT CORE · v0.2</span></div>
  <div class="eyebrow">WebAssembly build intelligence</div><h1>${d ? 'See what changed.' : 'Every byte, accounted for.'}</h1>
  <p class="intro">${d ? 'Compare raw binary sizes and locate growth by section. Keep build size within a measurable budget.' : 'Inspect module sections and defined function bodies. All byte measurements come from the MoonBit analysis core.'}</p>
  <div class="files muted small">${d ? `Before: <code>${escape(files.before ?? 'before.wasm')}</code> → After: <code>${escape(files.after ?? 'after.wasm')}</code>` : `<code>${escape(files.input ?? 'module.wasm')}</code>`}</div>
  <div class="metrics"><div class="metric"><div class="eyebrow">${d ? 'Current build' : 'File size'}</div><strong>${bytes(a.total_bytes)}</strong><span class="muted small">${a.sections.length} sections · ${a.functions.length} defined functions</span></div>
  <div class="metric"><div class="eyebrow">${d ? 'Change from baseline' : 'Module header'}</div><strong class="${d ? sizeClass(d.delta_bytes) : ''}">${d ? signed(d.delta_bytes) : '8 B'}</strong><span class="muted small">${d ? `Baseline ${bytes(d.before_bytes)}` : 'Header + section totals = file size'}</span></div>
  <div class="metric"><div class="eyebrow">Size budget</div><strong class="${budget ? budget.passed ? 'down' : 'up' : ''}">${budget ? budget.passed ? 'PASS' : 'FAIL' : 'Not set'}</strong><span class="muted small">${budget ? `Total ≤ ${budget.max_bytes === null ? 'unlimited' : bytes(budget.max_bytes)} · Growth ≤ ${budget.max_growth_bytes === null ? 'unlimited' : bytes(budget.max_growth_bytes)}` : 'Use --max-bytes or --max-growth'}</span></div></div>
  ${budget?.violations.length ? `<div class="note warnings">${budget.violations.map(escape).join('<br>')}</div>` : ''}
  ${warnings.length ? `<div class="note warnings"><b>Metadata warnings</b><br>${warnings.map(escape).join('<br>')}</div>` : ''}
  <div class="layout"><section class="panel"><div class="panelhead"><h2>${d ? 'Section changes' : 'Section breakdown'}</h2><span class="badge">Raw bytes</span></div>
  <div class="stack" role="img" aria-label="Current file section proportions">${sections.map(s => `<span title="${escape(label(s))}: ${bytes(s.total_bytes)}" style="width:${100*s.total_bytes/a.total_bytes}%;background:${color(s)}"></span>`).join('')}<span style="width:${800/a.total_bytes}%;background:#cdd5de" title="Module header: 8 B"></span></div>
  <div class="tablewrap"><table><thead><tr><th>Section</th>${d ? '<th>Before</th><th>After</th><th>Delta</th>' : '<th>Payload</th><th>Total</th>'}</tr></thead><tbody>${rows.map(s => `<tr><td><span class="dot" style="background:${color(s)}"></span>${escape(label(s))}</td>${d ? `<td>${bytes(s.before_bytes)}</td><td>${bytes(s.after_bytes)}</td><td class="${sizeClass(s.delta_bytes)}">${signed(s.delta_bytes)}</td>` : `<td>${bytes(s.payload_bytes)}</td><td>${bytes(s.total_bytes)}</td>`}</tr>`).join('')}</tbody></table></div>
  <p class="note">${allRows.length>100?`Showing the largest 100 of ${allRows.length} rows. `:''}Section totals include ID and length bytes. The fixed 8-byte module header is separate. Repeated custom names are grouped in comparisons. Sizes are uncompressed.</p></section>
  <section class="panel"><div class="panelhead"><h2>Largest function bodies</h2><span class="badge">Top 15</span></div>
  <div class="tablewrap"><table><thead><tr><th>Function</th><th>Body + prefix</th></tr></thead><tbody>${functionRows.length ? functionRows.map(f => `<tr><td><code>${escape(f.symbol?.display ?? f.name ?? (f.function_index === null ? `code[${f.ordinal}]` : `func[${f.function_index}]`))}</code><div class="muted small">code[${f.ordinal}] · offset ${f.offset}</div>${f.symbol?`<div class="muted small">${f.symbol.status==='decoded'?'Decoded MoonBit v0':f.symbol.status==='unsupported'?'Unsupported symbol · original retained':'Original symbol'}${f.symbol.package_name?` · encoded package: ${escape(f.symbol.package_name)}`:''}</div>${f.symbol.status==='decoded'?`<details><summary class="small muted">Raw symbol</summary><code>${escape(f.symbol.raw)}</code></details>`:''}`:''}</td><td>${bytes(f.total_bytes)}</td></tr>`).join('') : '<tr><td colspan="2">No defined function bodies.</td></tr>'}</tbody></table></div>
  <p class="note">Function bytes are already inside the code section. This is encoded body size, including its length prefix, not removable or retained size. Encoded package labels are symbol metadata, not source-map attribution. Names are optional; indices are local to this build.</p></section></div>
  <p class="foot">MoonSize · Structural inspection of core Wasm modules. Instructions are not executed or semantically validated. Compare builds with the same compiler, target and flags for meaningful results.</p>`;
}

export function renderReport(result, files = {}) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoonSize · Build report</title><style>${styles}</style><main>${renderBody(result, files)}</main></html>`;
}
