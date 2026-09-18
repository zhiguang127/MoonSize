import {attributionMessages} from './i18n.mjs';
import {referencePath} from './reference-view.mjs';

// Self-contained renderer and controller are also embedded in offline reports.
// Every binary-controlled string crosses the same HTML escaping boundary.
export function attributionView(model, copy, state, pathFor) {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>n===null?'—':`${n.toLocaleString(model.locale)} B`;
  const delta=n=>n===null?'—':`${n>0?'+':''}${fmt(n)}`;
  const percent=(n,d)=>d?`${(100*n/d).toFixed(1)}%`:'—';
  const label=f=>f?.label??'—';
  const direction=n=>n>0?'up':n<0?'down':'';
  const pageSize=25;
  const pager=(page,count,prefix)=>`<div class="deep-toolbar"><button type="button" class="secondary" data-action="${prefix}-prev" ${page===0?'disabled':''}>${copy.previous}</button><span>${count? page*pageSize+1:0}–${Math.min(count,(page+1)*pageSize)} / ${count} ${copy.rows}</span><button type="button" class="secondary" data-action="${prefix}-next" ${(page+1)*pageSize>=count?'disabled':''}>${copy.next}</button></div>`;
  let html='';
  if(model.comparison){
    const d=model.comparison;
    const coverage=side=>{const c=d.matching[side];return `<div><h3>${copy[side]}</h3><p>${copy.matched}: <b>${c.matched_functions} / ${c.total_functions} (${percent(c.matched_functions,c.total_functions)})</b></p><p>${copy.matchedBytes}: <b>${fmt(c.matched_bytes)} / ${fmt(c.total_bytes)} (${percent(c.matched_bytes,c.total_bytes)})</b></p><p class="muted small">${copy.missing_name}: ${c.missing_name} · ${copy.ambiguous_name}: ${c.ambiguous_name} · ${copy.symbol_only_here}: ${c.symbol_only_here}</p></div>`;};
    html+=`<section class="panel deep-panel"><h2>${copy.coverage}</h2><div class="deep-grid">${coverage('before')}${coverage('after')}</div><p class="note">${copy.matchNote}</p></section>`;
    const packages=d.packages;
    const page=Math.min(state.packagePage,Math.max(0,Math.ceil(packages.length/pageSize)-1));
    html+=`<section class="panel deep-panel"><h2>${copy.packages}</h2><div class="tablewrap"><table><thead><tr><th>${copy.package}</th><th>${copy.before}</th><th>${copy.after}</th><th>${copy.delta}</th></tr></thead><tbody>${packages.slice(page*pageSize,(page+1)*pageSize).map(p=>`<tr><td>${esc(p.package_name??copy.unknown)}</td><td>${fmt(p.before_bytes)}</td><td>${fmt(p.after_bytes)}</td><td class="${direction(p.delta_bytes)}">${delta(p.delta_bytes)}</td></tr>`).join('')}</tbody></table></div>${pager(page,packages.length,'package')}<p class="note">${copy.packageNote}<br>${copy.overhead}: ${delta(d.code_overhead_delta_bytes)}</p></section>`;
    const query=state.search.toLowerCase();
    const rows=d.functions.filter(row=>{
      if(state.change!=='all'&&row.change!==state.change)return false;
      return [model.before?.functions[row.before],model.after.functions[row.after]].some(f=>f&&`${f.label} ${f.raw??''} ${f.package??''}`.toLowerCase().includes(query));
    });
    const fp=Math.min(state.functionPage,Math.max(0,Math.ceil(rows.length/pageSize)-1));
    const changes=['grown','shrunk','added_symbol','removed_symbol','same_size','unmatched_before','unmatched_after'];
    const inspect=(side,f)=>f?.index===null||!f?'':`<button type="button" class="secondary small" data-inspect="${f.index}" data-side="${side}">${copy[side]} · ${copy.inspect}</button>`;
    html+=`<section class="panel deep-panel"><h2>${copy.functions}</h2><div class="deep-toolbar"><label>${copy.search}<input data-field="search" type="search" value="${esc(state.search)}"></label><label>${copy.state}<select data-field="change"><option value="all">${copy.all}</option>${changes.map(c=>`<option value="${c}" ${c===state.change?'selected':''}>${copy[c]}</option>`).join('')}</select></label></div><div class="tablewrap"><table><thead><tr><th>${copy.function}</th><th>${copy.state}</th><th>${copy.before}</th><th>${copy.after}</th><th>${copy.delta}</th></tr></thead><tbody>${rows.slice(fp*pageSize,(fp+1)*pageSize).map(row=>{
      const a=model.before?.functions[row.before],b=model.after.functions[row.after];
      return `<tr><td><code>${esc(label(b??a))}</code><div>${inspect('before',a)} ${inspect('after',b)}</div></td><td>${copy[row.change]}<div class="muted small">${row.match_kind==='matched_exact'?copy.exact:copy[row.reason]}</div></td><td>${a?fmt(a.bytes):'—'}</td><td>${b?fmt(b.bytes):'—'}</td><td class="${direction(row.delta_bytes)}">${delta(row.delta_bytes)}</td></tr>`;
    }).join('')||`<tr><td colspan="5">${copy.noRows}</td></tr>`}</tbody></table></div>${pager(fp,rows.length,'function')}</section>`;
  }
  const side=state.side==='before'&&model.before?'before':'after';
  const analysis=model[side],g=analysis.references;
  if(!g)return html;
  const names=new Map(analysis.functions.filter(f=>f.index!==null).map(f=>[f.index,f.label]));
  const name=i=>names.get(i)||g.nodes[i]?.name||`func[${i}]`;
  const link=i=>`<button type="button" class="ref-link" data-inspect="${i}" data-side="${side}">${esc(name(i))} <span class="muted">#${i}</span></button>`;
  const query=state.graphSearch.toLowerCase();
  const candidates=g.nodes.filter(n=>`${name(n.function_index)} ${n.function_index}`.toLowerCase().includes(query));
  const choices=candidates.slice(0,50);
  const node=g.nodes[state.selected];
  if(node&&!choices.some(n=>n.function_index===node.function_index))choices.unshift(node);
  html+=`<section class="panel deep-panel" data-reference-panel><h2>${copy.references}</h2><p class="muted">${copy.graphStatus}: ${copy[g.status]} · ${g.decoded_functions}/${g.total_functions} ${copy.decodedFunctions} · ${g.edges.length} ${copy.edges} · ${g.dynamic_references.length} ${copy.dynamic} · ${g.issues.length} ${copy.issues}</p><p class="note">${copy.graphNote}</p><div class="deep-toolbar"><label>${copy.graphSide}<select data-field="side">${model.before?`<option value="before" ${side==='before'?'selected':''}>${copy.before}</option>`:''}<option value="after" ${side==='after'?'selected':''}>${copy.after}</option></select></label><label>${copy.findFunction}<input data-field="graphSearch" type="search" value="${esc(state.graphSearch)}"></label><label>${copy.selectFunction}<select data-field="selected">${choices.map(n=>`<option value="${n.function_index}" ${n.function_index===state.selected?'selected':''}>#${n.function_index} ${esc(name(n.function_index))}</option>`).join('')}</select></label></div><p class="muted small">${candidates.length} ${copy.rows} · ${copy.limited}</p>`;
  if(node){
    const path=pathFor(g,node.function_index);
    const rootLabel=root=>`${copy[root.kind]??root.kind} ${root.name}`;
    const pathEdges=path.edges.slice(0,50);
    html+=`<h3>${esc(name(node.function_index))} <span class="badge">${copy[node.scan_status]}</span></h3><h4>${copy.path}</h4><div class="reference-path">${path.root?`${esc(rootLabel(path.root))} → ${link(path.root.function_index)}${pathEdges.map(e=>` → <span class="badge">${esc(e.kind)}</span> ${link(e.target)}`).join('')}${path.edges.length>50?` … (${path.edges.length} ${copy.edges})`:''}`:copy.noPath}</div>`;
    const incoming=node.incoming.map(i=>g.edges[i]),outgoing=node.outgoing.map(i=>g.edges[i]);
    const isCall=e=>e.kind==='call'||e.kind==='return_call';
    const edgeList=(title,list,from)=>`<div><h4>${title} (${list.length})</h4>${list.length?`<ul class="ref-list">${list.slice(0,50).map(e=>`<li>${from?(e.source_kind==='function'?link(e.source_index):esc(`${copy[e.source_kind]??e.source_kind}[${e.source_index}]`)):link(e.target)} <span class="muted small">${esc(e.kind)} · ${copy.byte} ${e.offset}</span></li>`).join('')}</ul>${list.length>50?`<p class="muted small">${copy.limited}</p>`:''}`:`<p class="muted">${copy.none}</p>`}</div>`;
    html+=`<div class="deep-grid">${edgeList(copy.callers,incoming.filter(e=>e.source_kind==='function'&&isCall(e)),true)}${edgeList(copy.callees,outgoing.filter(isCall),false)}${edgeList(copy.referencesIn,incoming.filter(e=>e.source_kind!=='function'||!isCall(e)),true)}${edgeList(copy.referencesOut,outgoing.filter(e=>!isCall(e)),false)}</div>`;
    const dyn=g.dynamic_references.filter(d=>d.source_kind==='function'&&d.source_index===node.function_index);
    if(dyn.length)html+=`<h4>${copy.dynamicHere} (${dyn.length})</h4><ul>${dyn.slice(0,50).map(d=>`<li><code>${esc(d.kind)}</code> · ${copy.byte} ${d.offset} · type[${d.type_index}]${d.table_index===null?'':` · table[${d.table_index}]`}</li>`).join('')}</ul>`;
    const tables=new Set(dyn.map(d=>d.table_index).filter(n=>n!==null));
    if(tables.size){
      const members=[...new Set(g.edges.filter(e=>e.table_index!==null&&tables.has(e.table_index)&&e.source_kind!=='function').map(e=>e.target))];
      html+=`<h4>${copy.candidates}</h4><p>${members.length?members.slice(0,50).map(link).join(' · '):copy.noCandidates}</p>`;
    }
  }
  if(g.issues.length)html+=`<details><summary>${copy.issues} (${g.issues.length})</summary><ul>${g.issues.slice(0,50).map(i=>`<li>${esc(i.source_kind)}[${i.source_index}] · ${copy.byte} ${i.offset}: ${esc(i.message)}</li>`).join('')}</ul>${g.issues.length>50?copy.limited:''}</details>`;
  return html+'</section>';
}

export function mountAttributionReports(root, view=attributionView, pathFor=referencePath) {
  for(const container of root.querySelectorAll('[data-attribution-report]')){
    if(container.dataset.mounted)continue;
    container.dataset.mounted='true';
    const {model,copy,state}=JSON.parse(container.querySelector('[data-attribution-data]').textContent);
    const surface=container.querySelector('[data-attribution-view]');
    const draw=()=>{surface.innerHTML=view(model,copy,state,pathFor);};
    container.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button||!container.contains(button))return;
      if(button.dataset.inspect!==undefined){state.side=button.dataset.side;state.selected=Number(button.dataset.inspect);draw();surface.querySelector('[data-reference-panel]')?.scrollIntoView({block:'nearest'});}
      else if(button.dataset.action){const [target,action]=button.dataset.action.split('-');state[`${target}Page`]=Math.max(0,state[`${target}Page`]+(action==='next'?1:-1));draw();}
    });
    const change=event=>{
      const field=event.target.dataset.field;
      if(!field)return;
      if(event.type==='input'&&event.target.tagName==='SELECT')return;
      if(event.type==='change'&&event.target.tagName==='INPUT')return;
      const focus=event.target,caret=focus.selectionStart;
      state[field]=field==='selected'?Number(focus.value):focus.value;
      if(field==='search'||field==='change')state.functionPage=0;
      if(field==='side')state.selected=model[state.side].functions.find(f=>f.index!==null)?.index??0;
      draw();
      const next=surface.querySelector(`[data-field="${field}"]`);
      next?.focus({preventScroll:true});
      if(next?.tagName==='INPUT'&&caret!==null)next.setSelectionRange(caret,caret);
    };
    container.addEventListener('input',change);container.addEventListener('change',change);
  }
}

export function renderAttribution(result,locale) {
  const compact=a=>a?{functions:a.functions.map(f=>({index:f.function_index,label:f.symbol?.display??f.name??`code[${f.ordinal}]`,raw:f.name,package:f.symbol?.package_name??null,bytes:f.total_bytes})),references:a.references}:null;
  const model={locale:locale==='zh'?'zh-CN':'en-US',before:compact(result.before),after:compact(result.analysis??result.after),comparison:null};
  if(result.comparison?.matching){const d=result.comparison;model.comparison={matching:d.matching,code_overhead_delta_bytes:d.code_overhead_delta_bytes,
    packages:d.packages.toSorted((a,b)=>Math.abs(b.delta_bytes)-Math.abs(a.delta_bytes)),
    functions:d.functions.map(r=>({...r,before:r.before?.ordinal??null,after:r.after?.ordinal??null})).toSorted((a,b)=>Math.abs(b.delta_bytes??0)-Math.abs(a.delta_bytes??0))};}
  const state={packagePage:0,functionPage:0,search:'',change:'all',side:'after',graphSearch:'',selected:model.after.functions.toSorted((a,b)=>b.bytes-a.bytes).find(f=>f.index!==null)?.index??0};
  const copy=attributionMessages[locale];
  const payload=JSON.stringify({model,copy,state}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return `<div data-attribution-report><script type="application/json" data-attribution-data>${payload}</script><div data-attribution-view>${attributionView(model,copy,state,referencePath)}</div></div>`;
}

export const attributionScript=`(${mountAttributionReports.toString()})(document,${attributionView.toString()},${referencePath.toString()});`;
export const attributionStyles=`
.deep-panel{margin-top:20px}.deep-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.deep-grid>div{min-width:0}h3{font-size:15px;margin:16px 0 8px;overflow-wrap:anywhere}h4{font-size:13px;margin:18px 0 8px}.deep-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:16px 0}.deep-toolbar label{font-size:12px;display:flex;flex-direction:column;gap:5px;min-width:0;max-width:100%}.deep-toolbar input,.deep-toolbar select{font:inherit;padding:8px;border:1px solid var(--line);border-radius:6px;max-width:440px;min-width:120px;width:100%;background:white;color:var(--ink)}.deep-panel td:first-child{max-width:380px}.deep-panel td{white-space:normal!important}.deep-panel td button{margin-top:6px;padding:5px 8px}.reference-path{padding:14px;background:#f3f6fb;border-radius:8px;overflow-wrap:anywhere}.ref-link{display:inline;padding:2px 0;background:transparent;color:#214caa;text-align:left;overflow-wrap:anywhere;max-width:100%;white-space:normal;font:inherit;text-decoration:underline;text-underline-offset:3px}.ref-list{padding-left:18px;font-size:13px}.ref-list li{margin:8px 0;overflow-wrap:anywhere}select:focus-visible{outline:3px solid #88acff;outline-offset:3px}@media(max-width:800px){.deep-grid{grid-template-columns:1fr}.deep-toolbar select{max-width:100%}}
`;
