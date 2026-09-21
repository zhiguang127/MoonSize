import {renderEngineering} from './engineering-report.mjs';
import {normalizeLocale,reportMessages} from './i18n.mjs';
import {renderAttribution,attributionScript,attributionStyles} from './attribution-report.mjs';

const formats = {en:new Intl.NumberFormat('en-US'),zh:new Intl.NumberFormat('zh-CN')};
export const bytes = (n, locale='en') => `${formats[normalizeLocale(locale)].format(n)} B`;
export const signed = (n, locale='en') => `${n > 0 ? '+' : ''}${bytes(n,locale)}`;
export const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const zhSectionLabels = {type:'类型',import:'导入',function:'函数',table:'表',memory:'内存',global:'全局变量',export:'导出',start:'启动',element:'元素',code:'代码',data:'数据',data_count:'数据计数',tag:'标签'};
const sectionLabel = (section, locale, copy) => {
  if(section.id===0)return `${copy.custom} · ${section.custom_name||`(${copy.emptyName})`}`;
  return locale==='zh' ? zhSectionLabels[section.label] ?? section.label.replace(/^unknown_/, '未知_') : section.label;
};
const localizeViolation = (message, locale, copy) => {
  if(locale!=='zh')return message;
  let match=/^Total (-?[0-9]+) bytes exceeds limit ([0-9]+)$/.exec(message);
  if(match)return copy.totalViolation(match[1],match[2]);
  match=/^Growth (-?[0-9]+) bytes exceeds limit ([0-9]+)$/.exec(message);
  return match?copy.growthViolation(match[1],match[2]):message;
};

export const styles = `
:root{color-scheme:light;--ink:#17222e;--muted:#5d6d7e;--line:#dae2e7;--blue:#2563eb;--green:#117c63;--red:#b93842}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f3f6f9;color:var(--ink);font:15px/1.55 system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:42px 28px 64px}h1,h2,p{margin:0}h1{font-size:42px;letter-spacing:-2px;line-height:1.15}h2{font-size:18px;letter-spacing:-.3px}
.topline{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:36px}.topactions{display:flex;align-items:center;gap:10px}.brand{font-weight:800;letter-spacing:-.5px;font-size:20px}.brand span{color:var(--blue)}
.badge{display:inline-flex;border:1px solid var(--line);border-radius:30px;padding:5px 12px;font-size:12px;font-weight:650;background:white}.intro{max-width:720px;color:var(--muted);margin-top:14px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:750;color:var(--muted);margin-bottom:8px}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}.metric,.panel{background:white;border:1px solid var(--line);border-radius:15px;padding:24px;min-width:0}.metric strong{font-size:32px;letter-spacing:-1px;display:block;margin:7px 0}.muted{color:var(--muted)}.small{font-size:12px}.up{color:var(--red)}.down{color:var(--green)}
.layout{display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:start}.panelhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.stack{display:flex;width:100%;height:16px;border-radius:6px;overflow:hidden;margin:20px 0}.stack span{min-width:0}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:700}td,th{padding:12px 6px;border-bottom:1px solid #ecf0f3;text-align:right;vertical-align:top}td:first-child,th:first-child{text-align:left;overflow-wrap:anywhere}td:first-child{max-width:230px}td:not(:first-child),th:not(:first-child){white-space:nowrap}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}code{font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}.note{padding:14px 16px;border:1px solid var(--line);border-radius:10px;margin:16px 0;color:var(--muted);font-size:12px;background:#f8fafc}.warnings{border-color:#edcc9c;background:#fff9ef;color:#795425}.foot{margin-top:24px;color:var(--muted);font-size:12px}.files{overflow-wrap:anywhere;margin-top:12px}.report-switch{display:flex;justify-content:flex-end;margin-bottom:12px}.controls{margin:28px 0;padding:24px;background:white;border:1px solid var(--line);border-radius:15px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.controls label{font-size:13px;font-weight:650;display:block}.controls input{display:block;max-width:100%;margin-top:8px}.controls input[type=number]{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px;font:inherit}.actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;grid-column:1/-1}button{border:0;border-radius:8px;background:var(--blue);color:white;font:600 13px system-ui;padding:11px 18px;cursor:pointer}button:disabled{opacity:.45;cursor:wait}button.secondary{background:#eaf0ff;color:#214caa}.language{padding:7px 12px}#status{color:var(--muted);font-size:13px}input:focus-visible,button:focus-visible{outline:3px solid #88acff;outline-offset:3px}
.engineering .panelhead{flex-wrap:wrap}.engineering table{min-width:540px}.engineering td:first-child,.engineering th:first-child{white-space:nowrap;overflow-wrap:normal}
@media(max-width:800px){main{padding:24px 16px}.layout{grid-template-columns:1fr}.metrics{grid-template-columns:1fr}.controls{grid-template-columns:1fr}h1{font-size:34px}.topline{margin-bottom:24px;align-items:flex-start}.topactions{align-items:flex-end;flex-direction:column}.metric strong{font-size:28px}}`;

export function renderBody(result, files = {}, requestedLocale='en') {
  const locale=normalizeLocale(requestedLocale),copy=reportMessages[locale];
  const formatBytes=n=>bytes(n,locale),formatSigned=n=>signed(n,locale);
  const label=section=>sectionLabel(section,locale,copy);
  const a = result.analysis ?? result.after;
  const d = result.comparison;
  const budget = result.budget;
  const decision=result.engineering?.decision;
  const policyStatus=decision?.status??(budget?(budget.passed?'pass':'fail'):'not_configured');
  const palette = ['#2563eb','#17a398','#f5a94d','#7e6ce0','#67a2d0','#c86d95','#6e8b61'];
  const sections = a.sections.toSorted((x,y) => y.total_bytes - x.total_bytes || x.offset - y.offset);
  const sectionKey = s => `${s.id}:${s.custom_name ?? ''}`;
  const colors = new Map();
  for (const s of sections) if (!colors.has(sectionKey(s))) colors.set(sectionKey(s), palette[colors.size % palette.length]);
  const color = s => colors.get(sectionKey(s)) ?? '#9aa9b8';
  const allRows = d ? d.sections.toSorted((x,y) => Math.abs(y.delta_bytes)-Math.abs(x.delta_bytes)) : sections;
  const rows = allRows.slice(0,100);
  const functionRows = a.functions.toSorted((x,y) => y.total_bytes-x.total_bytes || x.ordinal-y.ordinal).slice(0,15);
  const separator=locale==='zh'?'：':': ';
  const warnings = [...(result.before?.warnings ?? []).map(w => `${copy.warningBefore}${separator}${w}`), ...a.warnings.map(w => `${d ? copy.warningAfter+separator : ''}${w}`)];
  const sizeClass = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
  return `<div class="topline"><div class="brand">◔ Moon<span>Size</span></div><span class="badge">MOONBIT CORE · SCHEMA ${a.schema_version}</span></div>
  <div class="eyebrow">${copy.tagline}</div><h1>${d ? copy.changedTitle : copy.singleTitle}</h1>
  <p class="intro">${d ? copy.changedIntro : copy.singleIntro}</p>
  <div class="files muted small">${d ? `${copy.before}${separator}<code>${escape(files.before ?? 'before.wasm')}</code> → ${copy.after}${separator}<code>${escape(files.after ?? 'after.wasm')}</code>` : `<code>${escape(files.input ?? 'module.wasm')}</code>`}</div>
  <div class="metrics"><div class="metric"><div class="eyebrow">${d ? copy.currentBuild : copy.fileSize}</div><strong>${formatBytes(a.total_bytes)}</strong><span class="muted small">${copy.counts(a.sections.length,a.functions.length)}</span></div>
  <div class="metric"><div class="eyebrow">${d ? copy.changeFromBaseline : copy.moduleHeader}</div><strong class="${d ? sizeClass(d.delta_bytes) : ''}">${d ? formatSigned(d.delta_bytes) : '8 B'}</strong><span class="muted small">${d ? copy.baseline(formatBytes(d.before_bytes)) : copy.headerEquation}</span></div>
  <div class="metric"><div class="eyebrow">${decision?(locale==='zh'?'综合策略':'Combined policy'):copy.sizeBudget}</div><strong class="${policyStatus==='pass'?'down':policyStatus==='fail'?'up':''}">${policyStatus==='pass'?copy.pass:policyStatus==='fail'?copy.fail:copy.notSet}</strong><span class="muted small">${decision && decision.status!=='not_configured' ? (locale==='zh'?'详见下方各项预算与构建条件检查':'See individual budgets and build condition checks below') : budget ? `${copy.total} ≤ ${budget.max_bytes === null ? copy.unlimited : formatBytes(budget.max_bytes)} · ${copy.growth} ≤ ${budget.max_growth_bytes === null ? copy.unlimited : formatBytes(budget.max_growth_bytes)}` : copy.budgetHint}</span></div></div>
  ${budget?.violations.length ? `<div class="note warnings">${budget.violations.map(value=>escape(localizeViolation(value,locale,copy))).join('<br>')}</div>` : ''}
  ${warnings.length ? `<div class="note warnings"><b>${copy.metadataWarnings}</b><br>${warnings.map(escape).join('<br>')}</div>` : ''}
  ${renderEngineering(result,locale)}
  <div class="layout"><section class="panel"><div class="panelhead"><h2>${d ? copy.sectionChanges : copy.sectionBreakdown}</h2><span class="badge">${copy.rawBytes}</span></div>
  <div class="stack" role="img" aria-label="${copy.proportions}">${sections.map(s => `<span title="${escape(label(s))}: ${formatBytes(s.total_bytes)}" style="width:${100*s.total_bytes/a.total_bytes}%;background:${color(s)}"></span>`).join('')}<span style="width:${800/a.total_bytes}%;background:#cdd5de" title="${copy.moduleHeader}: 8 B"></span></div>
  <div class="tablewrap"><table><thead><tr><th>${copy.section}</th>${d ? `<th>${copy.beforeColumn}</th><th>${copy.afterColumn}</th><th>${copy.delta}</th>` : `<th>${copy.payload}</th><th>${copy.totalColumn}</th>`}</tr></thead><tbody>${rows.map(s => `<tr><td><span class="dot" style="background:${color(s)}"></span>${escape(label(s))}</td>${d ? `<td>${formatBytes(s.before_bytes)}</td><td>${formatBytes(s.after_bytes)}</td><td class="${sizeClass(s.delta_bytes)}">${formatSigned(s.delta_bytes)}</td>` : `<td>${formatBytes(s.payload_bytes)}</td><td>${formatBytes(s.total_bytes)}</td>`}</tr>`).join('')}</tbody></table></div>
  <p class="note">${allRows.length>100?copy.showingRows(100,allRows.length)+' ':''}${copy.sectionNote}</p></section>
  <section class="panel"><div class="panelhead"><h2>${copy.largestFunctions}</h2><span class="badge">${copy.top15}</span></div>
  <div class="tablewrap"><table><thead><tr><th>${copy.function}</th><th>${copy.bodyPrefix}</th></tr></thead><tbody>${functionRows.length ? functionRows.map(f => `<tr><td><code>${escape(f.symbol?.display ?? f.name ?? (f.function_index === null ? `code[${f.ordinal}]` : `func[${f.function_index}]`))}</code><div class="muted small">${copy.codeOffset(f.ordinal,f.offset)}</div>${f.symbol?`<div class="muted small">${f.symbol.status==='decoded'?copy.decoded:f.symbol.status==='unsupported'?copy.unsupported:copy.original}${f.symbol.package_name?` · ${copy.encodedPackage}: ${escape(f.symbol.package_name)}`:''}</div>${f.symbol.status==='decoded'?`<details><summary class="small muted">${copy.rawSymbol}</summary><code>${escape(f.symbol.raw)}</code></details>`:''}`:''}</td><td>${formatBytes(f.total_bytes)}</td></tr>`).join('') : `<tr><td colspan="2">${copy.noFunctions}</td></tr>`}</tbody></table></div>
  <p class="note">${copy.functionNote}</p></section></div>
  ${renderAttribution(result,locale)}
  <p class="foot">${copy.footer}</p>`;
}

export function renderReport(result, files = {}, requestedLocale='en') {
  const locale=normalizeLocale(requestedLocale),copy=reportMessages[locale];
  const report=(key,hidden)=>{
    const messages=reportMessages[key];
    return `<main data-report-locale="${key}"${hidden?' hidden':''}><div class="report-switch"><button type="button" class="secondary language" data-switch-locale="${key==='en'?'zh':'en'}" aria-label="${messages.switchAria}">${messages.switchLabel}</button></div>${renderBody(result,files,key)}</main>`;
  };
  const script=`<script>(()=>{const show=locale=>{for(const report of document.querySelectorAll('[data-report-locale]'))report.hidden=report.dataset.reportLocale!==locale;document.documentElement.lang=locale==='zh'?'zh-CN':'en';document.title=locale==='zh'?'MoonSize · 构建报告':'MoonSize · Build report';};for(const button of document.querySelectorAll('[data-switch-locale]'))button.addEventListener('click',()=>show(button.dataset.switchLocale));show('${locale}');})();</script>`;
  return `<!doctype html><html lang="${copy.lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.title}</title><style>${styles}${attributionStyles}</style>${report('en',locale!=='en')}${report('zh',locale!=='zh')}${script}<script>${attributionScript}</script></html>`;
}
