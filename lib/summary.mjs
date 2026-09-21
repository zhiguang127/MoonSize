// Untrusted names never become Markdown links, HTML, headings or table delimiters.
export const markdownText = value => String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,' ').slice(0,256)
  .replace(/[&<>"'`|\[\]()*_!#\\~]/g,c=>`&#${c.codePointAt(0)};`);
const bytes=n=>n===null?'—':`${n} B`;
const delta=n=>n===null?'—':`${n>0?'+':''}${n} B`;
const percentage=(n,total)=>total?`${(100*n/total).toFixed(1)}%`:'n/a';
function table(title, headers, rows) {
  return `\n### ${title}\n\n| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map(row=>`| ${row.join(' | ')} |`).join('\n')}\n`;
}
export function renderSummary(result, files={}) {
  const e=result.engineering,d=result.comparison,a=result.after??result.analysis;
  const title={pass:'✅ Policy passed',fail:'❌ Policy failed',not_configured:'Size report · no policy configured'}[e.decision.status];
  let text=`\n## MoonSize · ${title}\n\n${markdownText(files.before??files.input??'module.wasm')}${d?` → ${markdownText(files.after??'module.wasm')}`:''}\n`;
  text+=table('Artifact sizes',['Metric','Before','After','Change','Max size','Max growth','Budget'],Object.entries(e.delivery.metrics).map(([name,m])=>{
    const check=e.decision.checks.find(c=>c.metric===name);
    return [name,m?bytes(m.before_bytes):'not measured',m?bytes(m.after_bytes):'not measured',m?`${delta(m.delta_bytes)}${m.before_bytes?` (${percentage(m.delta_bytes,m.before_bytes)})`:''}`:'—',check?bytes(check.max_bytes):'—',check?bytes(check.max_growth_bytes):'—',check?(check.passed?'PASS':'FAIL'):'not configured'];
  }));
  for(const v of e.decision.violations)text+=`\n- **${v.scope}**: ${markdownText(v.message)}\n`;
  text+='\nCompressed sizes are whole-file measurements under fixed settings, not observed network transfers. Package/function bytes are raw code subdivisions and are not additive to file size.\n';
  if(e.delivery.compression)text+=`\nCompression: ${markdownText(JSON.stringify(e.delivery.compression.settings))}. Runtime: ${markdownText(JSON.stringify(e.delivery.compression.implementation))}. Both artifacts recompressed in this run.\n`;
  const p=e.provenance,c=p.comparability;
  text+=`\n### Reported build conditions: ${c.status}\n\n${e.policy?.require_comparable?'Matching conditions are required by policy.':'Build conditions are informational; no condition gate is configured.'}\n\nSHA-256 binding verifies the supplied record belongs to these bytes; it does not attest how the artifact was built.\n`;
  text+=table('Artifact identity',['Side','SHA-256','Source revision'],['before','after'].filter(side=>p[side]).map(side=>[side,p[side].artifact.sha256,markdownText(p[side].build.source_revision??'unknown')]));
  if(c.differences.length)text+=table('Different conditions',['Field','Before','After'],c.differences.map(r=>[r.field,markdownText(JSON.stringify(r.before)),markdownText(JSON.stringify(r.after))]));
  if(c.missing.length)text+=`\nUnknown fields: ${c.missing.map(r=>`${r.field} (${[r.before?'before':null,r.after?'after':null].filter(Boolean).join(', ')})`).join('; ')}.\n`;
  if(d){
    const top=rows=>rows.filter(r=>r.delta_bytes>0).toSorted((x,y)=>y.delta_bytes-x.delta_bytes).slice(0,10);
    const ranked=(heading,rows)=>rows.length?table(heading,['Name','Growth'],rows):`\n### ${heading}\n\nNone observed.\n`;
    text+=ranked('Largest package growth · raw bodies',top(d.packages).map(r=>[markdownText(r.package_name??'[unknown ownership]'),delta(r.delta_bytes)]));
    text+=ranked('Matched function growth · unique raw symbols',top(d.functions.filter(r=>r.change==='grown')).map(r=>[markdownText(r.after.symbol?.display??r.after.name),delta(r.delta_bytes)]));
    text+=ranked('Symbols observed only after · not proof of new code',top(d.functions.filter(r=>r.change==='added_symbol')).map(r=>[markdownText(r.after.symbol?.display??r.after.name),delta(r.delta_bytes)]));
    text+=ranked('Largest section growth',top(d.sections).map(r=>[markdownText(r.id===0?`custom:${r.custom_name}`:r.label),delta(r.delta_bytes)]));
    text+=table('Function matching coverage',['Side','Matched functions','Matched body bytes'],['before','after'].map(side=>{const m=d.matching[side];return [side,`${m.matched_functions} / ${m.total_functions} (${percentage(m.matched_functions,m.total_functions)})`,`${m.matched_bytes} / ${m.total_bytes} B (${percentage(m.matched_bytes,m.total_bytes)})`];}));
    text+=`\nFunction categories: ${['grown','shrunk','same_size','added_symbol','removed_symbol','unmatched_before','unmatched_after'].map(change=>`${change}=${d.functions.filter(row=>row.change===change).length}`).join(', ')}.\n`;
    text+=`\nCode framing change: ${delta(d.code_overhead_delta_bytes)}. Unmatched functions are not assigned a fabricated delta. One-sided names may reflect renaming, inlining or stripping.\n`;
  }
  for(const [side,analysis] of [['before',result.before],['after',a]])if(analysis){
    const g=analysis.references;
    text+=`\nReferences (${side}): ${g.status}, ${g.decoded_functions}/${g.total_functions} decoded functions, ${g.dynamic_references.length} unresolved dynamic calls, ${g.issues.length} issues. Metadata warnings: ${analysis.warnings.length}.\n`;
    for(const warning of analysis.warnings.slice(0,3))text+=`\n- ${markdownText(warning)}\n`;
  }
  return text+'\nKnown references do not prove execution or removable size; no known path does not mean unused.\n';
}
