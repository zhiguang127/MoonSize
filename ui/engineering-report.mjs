// Host measurements are optional: browser analysis never invents compression data.
const escape=value=>String(value).replace(/[&<>"']/g,c=>`&#${c.codePointAt(0)};`);
const copy={
  en:{title:'Delivery sizes & build conditions',metric:'Metric',before:'Before',after:'After',change:'Change',budget:'Budget',missing:'Not measured',unset:'Not configured',total:'Total',growth:'Growth',conditions:'Reported build conditions',matching:'Matching',different:'Different',unknown:'Unknown',note:'Compressed sizes measure the whole file with fixed settings, not actual network transfers. When enabled, both artifacts are recompressed in the same run; package and function attribution remains raw bytes.',browser:'Use the CLI with --compress to measure gzip and Brotli. Browser analysis reports raw bytes only.',binding:'Records are bound to artifact SHA-256. Matching declarations do not attest the build process; missing fields remain unknown.',unknownFields:'Unknown fields',revision:'Source revision',compression:'Compression settings and runtime',policy:'Combined policy',pass:'PASS',fail:'FAIL',details:'Build record details',required:'Policy requires matching conditions',informational:'Conditions are informational; no condition gate configured'},
  zh:{title:'交付体积与构建条件',metric:'指标',before:'之前',after:'之后',change:'变化',budget:'预算',missing:'未测量',unset:'未配置',total:'总量',growth:'增长',conditions:'声明的构建条件',matching:'一致',different:'存在差异',unknown:'未知',note:'压缩体积按固定参数测量完整文件，不代表实际网络流量。启用压缩时，两份产物在同一次运行中重新压缩；包和函数归因仍使用原始字节。',browser:'使用 CLI 的 --compress 测量 gzip 和 Brotli；浏览器分析只测量原始字节。',binding:'记录绑定产物 SHA-256。声明一致不代表验证了实际构建过程；缺失字段保持未知。',unknownFields:'未知字段',revision:'源码版本',compression:'压缩参数与运行库',policy:'综合策略',pass:'通过',fail:'失败',details:'构建记录详情',required:'策略要求构建条件一致',informational:'构建条件仅作提示，未配置条件门禁'},
};
export function renderEngineering(result,locale) {
  const t=copy[locale]??copy.en,e=result.engineering;
  const raw={before_bytes:result.comparison?.before_bytes??null,after_bytes:(result.after??result.analysis).total_bytes,delta_bytes:result.comparison?.delta_bytes??null};
  const metrics=e?.delivery.metrics??{raw,gzip:null,brotli:null};
  const number=n=>n===null?'—':`${new Intl.NumberFormat(locale).format(n)} B`;
  const signed=n=>n===null?'—':`${n>0?'+':''}${number(n)}`;
  const c=e?.provenance.comparability??{status:'unknown',differences:[],missing:[]};
  const budget=m=>{
    const b=e?.decision.checks.find(row=>row.metric===m)??(m==='raw'?result.budget:null);
    return b?`${b.passed?t.pass:t.fail}<br><span class="muted small">${t.total} ≤ ${b.max_bytes===null?'∞':number(b.max_bytes)}<br>${t.growth} ≤ ${b.max_growth_bytes===null?'∞':number(b.max_growth_bytes)}</span>`:t.unset;
  };
  const violation=v=>{
    if(locale!=='zh')return escape(v.message);
    let match=/^(Total|Growth) ([0-9]+) bytes exceeds limit ([0-9]+)$/.exec(v.message);
    if(match)return `${match[1]==='Total'?'总量':'增长'} ${number(Number(match[2]))} 超过上限 ${number(Number(match[3]))}`;
    if(v.scope==='comparability')return `声明的构建条件${c.status==='different'?'存在差异':'信息不全'}；策略要求条件一致`;
    return escape(v.message);
  };
  return `<section class="panel engineering" style="margin:20px 0"><div class="panelhead"><h2>${t.title}</h2><span class="badge">RAW / gzip / Brotli</span></div>
  <div class="tablewrap"><table><thead><tr><th>${t.metric}</th><th>${t.before}</th><th>${t.after}</th><th>${t.change}</th><th>${t.budget}</th></tr></thead><tbody>${Object.entries(metrics).map(([key,m])=>`<tr><td>${key}</td><td>${m?number(m.before_bytes):'—'}</td><td>${m?number(m.after_bytes):t.missing}</td><td>${m?signed(m.delta_bytes):'—'}</td><td>${budget(key)}</td></tr>`).join('')}</tbody></table></div>
  <p class="note">${t.note}${e?.delivery.compression?'':` ${t.browser}`}</p>
  ${e?.delivery.compression?`<details><summary>${t.compression}</summary><code>${escape(JSON.stringify(e.delivery.compression))}</code></details>`:''}
  <h3>${t.conditions}: ${t[c.status]}</h3><p class="muted small">${e?.policy?.require_comparable?t.required:t.informational}<br>${t.binding}</p>
  ${c.differences.length?`<div class="tablewrap"><table><thead><tr><th>${t.conditions}</th><th>${t.before}</th><th>${t.after}</th></tr></thead><tbody>${c.differences.map(r=>`<tr><td>${escape(r.field)}</td><td><code>${escape(JSON.stringify(r.before))}</code></td><td><code>${escape(JSON.stringify(r.after))}</code></td></tr>`).join('')}</tbody></table></div>`:''}
  ${c.missing.length?`<p class="note">${t.unknownFields}: ${c.missing.map(r=>`${r.field} (${[r.before?t.before:null,r.after?t.after:null].filter(Boolean).join(', ')})`).join('; ')}</p>`:''}
  ${e?['before','after'].filter(side=>e.provenance[side]).map(side=>{const r=e.provenance[side];return `<details><summary>${t[side]} · ${t.details}</summary><p class="small">SHA-256: <code>${escape(r.artifact.sha256)}</code><br>${t.revision}: <code>${escape(r.build.source_revision??t.unknown)}</code></p><code>${escape(JSON.stringify(r.build))}</code></details>`;}).join(''):''}
  ${e?.decision.violations.length?`<div class="note warnings">${e.decision.violations.map(v=>`<b>${escape(v.scope)}</b>: ${violation(v)}`).join('<br>')}</div>`:''}
  </section>`;
}
