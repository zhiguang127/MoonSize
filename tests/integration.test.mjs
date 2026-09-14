import test from 'node:test';
import assert from 'node:assert/strict';
import {capture} from '../scripts/process.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyze_json,budget_json,compare_json} from '../_build/js/release/build/moonsize.js';
import {renderBody,renderReport} from '../ui/report.mjs';
const header=[0,97,115,109,1,0,0,0];
const empty=Uint8Array.from(header);
const named=Uint8Array.from([...header,0,3,1,120,65]);
const rawSymbol='_M0FPB3foo';
const symbolBytes=[...new TextEncoder().encode(rawSymbol)];
const namedFunction=Uint8Array.from([...header,1,4,1,96,0,0,3,2,1,0,10,4,1,2,0,11,0,10+symbolBytes.length,4,110,97,109,101,1,3+symbolBytes.length,1,0,symbolBytes.length,...symbolBytes]);
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=args=>capture(process.execPath,['bin/moonsize.mjs',...args],{cwd:root});

test('exported MoonBit bridge accepts a Uint8Array view with an offset',()=>{
  const buffer=new Uint8Array(32);buffer.set(empty,5);
  assert.equal(JSON.parse(analyze_json(buffer.subarray(5,13))).analysis.total_bytes,8);
  assert.equal(JSON.parse(analyze_json(new Uint8Array([1,2,3]))).ok,false);
});
test('fixtures are accepted by the independent engine validator',()=>{
  assert.equal(WebAssembly.validate(empty),true);
  assert.equal(WebAssembly.validate(named),true);
  assert.equal(JSON.parse(compare_json(empty,named)).comparison.delta_bytes,5);
});
test('budget bridge uses inclusive limits and rejects invalid limits',()=>{
  assert.equal(JSON.parse(budget_json(empty,named,13,5)).budget.passed,true);
  assert.equal(JSON.parse(budget_json(empty,named,12,5)).budget.passed,false);
  assert.equal(JSON.parse(budget_json(empty,named,-2,-1)).ok,false);
  assert.equal(JSON.parse(budget_json(empty,named,13,-1)).budget.max_growth_bytes,null);
});
test('optional names and unavailable function indices serialize as explicit null',()=>{
  const unnamed=Uint8Array.from([...header,3,2,1,0,10,4,1,2,0,11]);
  const r=JSON.parse(analyze_json(unnamed));
  assert.equal(r.analysis.functions[0].name,null);
  assert.equal(r.analysis.sections[0].custom_name,null);
  const unknown=Uint8Array.from([...header,2,4,1,0,0,255,3,2,1,0,10,4,1,2,0,11]);
  assert.equal(JSON.parse(analyze_json(unknown)).analysis.functions[0].function_index,null);
});

test('present optional JSON values are scalars or objects, never Option arrays',async()=>{
  assert.equal(WebAssembly.validate(namedFunction),true);
  const a=JSON.parse(analyze_json(namedFunction)).analysis;
  assert.equal(a.schema_version,2);
  assert.equal(a.functions[0].function_index,0);
  assert.equal(a.functions[0].name,rawSymbol);
  assert.equal(a.functions[0].symbol.display,'@moonbitlang/core/builtin.foo');
  assert.equal(a.functions[0].symbol.package_name,'moonbitlang/core/builtin');
  assert.equal(a.sections.at(-1).custom_name,'name');
  const r=JSON.parse(budget_json(empty,named,13,5));
  assert.equal(r.budget.max_bytes,13);assert.equal(r.budget.max_growth_bytes,5);
  assert.equal(r.comparison.sections[0].custom_name,'x');
  const dir=await mkdtemp(path.join(tmpdir(),'moonsize-'));
  try {
    const file=path.join(dir,'named.wasm');await writeFile(file,namedFunction);
    const out=cli(['analyze',file]);assert.equal(out.status,0,out.stderr);
    assert.match(out.stdout,/@moonbitlang\/core\/builtin.foo/);
    assert.match(renderReport({ok:true,analysis:a}),/@moonbitlang\/core\/builtin.foo/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI output, exit codes, HTML generation and input protection',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'moonsize-'));
  try {
    const a=path.join(dir,'before.wasm'), b=path.join(dir,'after.wasm'), bad=path.join(dir,'bad.wasm'), report=path.join(dir,'report.html');
    await Promise.all([writeFile(a,empty),writeFile(b,named),writeFile(bad,'bad')]);
    let r=cli(['analyze',a,'--json']);
    assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).analysis.total_bytes,8);
    r=cli(['diff',a,b,'--max-bytes','12','--json','--html',report]);
    assert.equal(r.status,1,r.stderr);assert.equal(JSON.parse(r.stdout).budget.passed,false);
    assert.match(await readFile(report,'utf8'),/FAIL/);
    r=cli(['diff',a,b,'--max-growth','5']);assert.equal(r.status,0,r.stderr);
    r=cli(['analyze',bad,'--json']);assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).ok,false);
    r=cli(['analyze',a,'--html',a]);assert.equal(r.status,2);assert.deepEqual(new Uint8Array(await readFile(a)),empty);
    for(const args of [['diff',a,b,'--max-bytes','2147483648'],['diff',a,b,'--max-growth','-1'],['diff',a,b,'--max-growth','1.5'],['analyze',a,'--unknown'],['analyze',a,'--html'],['analyze',a,'--json','--json'],['analyze',a,'--max-bytes','10'],['diff',a],['analyze',path.join(dir,'missing')]]){
      assert.equal(cli(args).status,2,args.join(' '));
    }
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir(),'moonsize-')));
    await rm(dir,{recursive:true,force:true});
  }
});
test('report escapes module controlled metadata and file labels',()=>{
  const a=JSON.parse(analyze_json(named));
  a.analysis.sections[0].custom_name='<img src=x onerror=alert(1)>';
  const html=renderReport(a,{input:'</script><script>alert(1)</script>'});
  assert.equal(html.includes('</script><script>alert(1)</script>'),false);
  assert.equal(html.includes('<img'),false);
  assert.match(html,/&lt;img/);
});
test('reports render complete English and Chinese variants',()=>{
  const result=JSON.parse(budget_json(empty,named,12,4));
  const files={before:'before.wasm',after:'after.wasm'};
  const english=renderBody(result,files,'en');
  assert.match(english,/See what changed\./);
  assert.match(english,/Section changes/);
  assert.match(english,/Total 13 bytes exceeds limit 12/);
  const chinese=renderBody(result,files,'zh-CN');
  assert.match(chinese,/看看哪里发生了变化。/);
  assert.match(chinese,/区段变化/);
  assert.match(chinese,/总量 13 字节超过上限 12/);
  assert.doesNotMatch(chinese,/See what changed\.|Section changes/);
  const standalone=renderReport(result,files,'zh-CN');
  assert.match(standalone,/<html lang="zh-CN">/);
  assert.match(standalone,/data-report-locale="en" hidden/);
  assert.match(standalone,/data-report-locale="zh"/);
  assert.match(standalone,/data-switch-locale="en"/);
});
test('deterministic mutation corpus produces bounded reports or errors, never throws',()=>{
  const source=Uint8Array.from([...header,1,4,1,96,0,0,3,2,1,0,10,4,1,2,0,11]);
  let state=0x12345678;
  for(let i=0;i<500;i++){
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const mutated=source.slice();mutated[state%mutated.length]=(state>>>16)&255;
    const r=JSON.parse(analyze_json(mutated));
    if(r.ok){assert.equal(r.analysis.total_bytes,mutated.length);assert.equal(r.analysis.module_header_bytes+r.analysis.sections.reduce((n,s)=>n+s.total_bytes,0),mutated.length);}
    else assert.equal(typeof r.error.offset,'number');
  }
});
