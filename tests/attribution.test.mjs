import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {analyze_json,compare_json} from '../_build/js/release/build/moonsize.js';
import {renderReport} from '../ui/report.mjs';
import {referencePath} from '../ui/reference-view.mjs';
import {capture} from '../scripts/process.mjs';
import {wasm,section,str,u32,exportFunction} from './wasm-fixtures.mjs';
const analyze=bytes=>{const r=JSON.parse(analyze_json(bytes));assert.equal(r.ok,true,JSON.stringify(r.error));return r.analysis;};
const valid=bytes=>{assert.equal(WebAssembly.validate(bytes),true);return analyze(bytes);};
const raw='_M0FPB3foo';

test('L2 engine-valid reorder, one-sided symbols and package/body accounting',()=>{
  const a=wasm([{name:raw},{name:'other',code:[1]}]);
  const b=wasm([{name:'other'},{name:raw,code:[1,1]},{name:'added'}]);
  valid(a);valid(b);
  const d=JSON.parse(compare_json(a,b)).comparison;
  assert.equal(d.schema_version,3);
  assert.equal(d.matching.exact_matches,2);
  assert.equal(d.functions[0].after.function_index,1);
  assert.equal(d.functions[2].change,'added_symbol');
  assert.equal(d.functions[2].confidence,'unavailable');
  assert.equal(d.packages.reduce((n,p)=>n+p.after_bytes,0),d.matching.after.total_bytes);
  assert.equal(d.packages.reduce((n,p)=>n+p.delta_bytes,0)+d.code_overhead_delta_bytes,d.sections.find(s=>s.id===10).delta_bytes);
  const unknown=JSON.parse(compare_json(wasm([{}, {name:'dup'},{name:'dup'}]),wasm([{}, {name:'dup'}]))).comparison;
  assert.equal(unknown.matching.exact_matches,0);
  assert.equal(unknown.matching.before.ambiguous_name,2);
  assert.ok(unknown.functions.every(f=>f.delta_bytes===null));
});

test('L3 valid imported calls and root paths preserve indices and byte evidence',()=>{
  const bytes=wasm([{name:'run',code:[16,2]},{name:'helper',code:[16,0]}],{
    imported:1,before:[section(2,[1,...str('env'),...str('log'),0,0]),exportFunction('run',1)]});
  const g=valid(bytes).references;
  const p=referencePath(g,0);
  assert.equal(p.root.name,'run');
  assert.deepEqual(p.edges.map(e=>[e.source_index,e.target]),[[1,2],[2,0]]);
  for(const e of g.edges)assert.equal(bytes[e.offset],16);
});

test('L3 valid call_indirect records table members without inventing calls',()=>{
  const a=valid(wasm([{name:'run',code:[65,0,17,0,0]},{name:'target'}],{before:[
    section(4,[1,112,0,1]),exportFunction('run',0),section(9,[1,0,65,0,11,1,1])]}));
  assert.equal(a.references.status,'partial');
  assert.equal(a.references.issues.length,0);
  assert.equal(a.references.dynamic_references[0].kind,'call_indirect');
  assert.equal(a.references.edges[0].source_kind,'element_active');
  assert.equal(a.references.edges[0].table_index,0);
  assert.equal(a.references.nodes[0].outgoing.length,0);
  assert.equal(referencePath(a.references,1).root.kind,'element_active');
});

test('L3 valid Wasm-GC, ref.func, call_ref and tail calls',()=>{
  const g=valid(wasm([{name:'entry',type:1,code:[251,0,0,26,210,1,20,1,18,1]},{name:'leaf',type:1}],{
    types:[2,95,0,96,0,0],before:[exportFunction('run',0),section(9,[1,3,0,1,1])]})).references;
  assert.equal(g.decoded_functions,2);
  assert.equal(g.issues.length,0);
  assert.deepEqual(g.nodes[0].outgoing.map(i=>g.edges[i].kind),['ref_func','return_call']);
  assert.equal(g.dynamic_references[0].kind,'call_ref');
  assert.equal(referencePath(g,1).root.kind,'export');
});

test('L3 valid SIMD and numeric payloads cannot generate phantom edges',()=>{
  const g=valid(wasm([{code:[65,16,26,67,16,0,210,0,26,253,12,...Array(8).fill([16,0]).flat(),26]}])).references;
  assert.equal(g.status,'decoded');assert.equal(g.edges.length,0);
});

test('L3 valid memory operands and bulk instructions preserve following calls',()=>{
  const g=valid(wasm([{code:[65,0,40,2,16,26,65,0,65,0,65,0,252,11,0,16,1]},{}],{
    before:[section(5,[1,0,1]),exportFunction('run',0)]})).references;
  assert.equal(g.status,'decoded');assert.equal(g.edges.length,1);assert.equal(g.edges[0].target,1);
});

test('reference errors preserve accounting and discard incomplete region edges',()=>{
  const bytes=wasm([{code:[16,0,255,16,0]}]);
  assert.equal(WebAssembly.validate(bytes),false);
  const a=analyze(bytes);
  assert.equal(a.total_bytes,bytes.length);
  assert.equal(a.references.nodes[0].scan_status,'incomplete');
  assert.equal(a.references.edges.length,0);
  assert.equal(a.references.issues.length,1);
  const badExport=analyze(wasm([{}],{before:[exportFunction('oops',99)]}));
  assert.equal(badExport.references.roots.length,0);
  assert.equal(badExport.references.status,'partial');
});

test('long root chains use a linear predecessor forest and bounded report rendering',()=>{
  const count=2000;
  const g=valid(wasm(Array.from({length:count},(_,i)=>({code:i+1<count?[16,...u32(i+1)]:[]})),{before:[exportFunction('run',0)]})).references;
  const p=referencePath(g,count-1);
  assert.equal(p.edges.length,count-1);
  assert.equal(p.root.name,'run');
  assert.ok(JSON.stringify(g).length<1000000);
});

test('new graph evidence and attribution labels are escaped in offline HTML',()=>{
  const danger='</script><img src=x onerror=alert(1)>';
  const a=wasm([{name:danger}],{before:[exportFunction(danger,0)]});
  const result=JSON.parse(compare_json(a,a));
  const html=renderReport(result,{},'zh');
  assert.ok(!html.includes('<img'));
  assert.match(html,/&lt;\/script&gt;/);
  assert.match(html,/函数匹配覆盖率/);
  assert.match(html,/Direct callers/);
  for(const [,data] of html.matchAll(/<script type="application\/json" data-attribution-data>(.*?)<\/script>/gs)){
    const payload=JSON.parse(data);assert.equal(payload.model.after.functions[0].raw,danger);
  }
});

test('CLI why works with JSON and text, rejects invalid indices and preserves budget exit',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'moonsize-l23-'));
  try{
    const file=path.join(dir,'app.wasm');
    await writeFile(file,wasm([{name:'entry',code:[16,1]},{name:'leaf'}],{before:[exportFunction('run',0)]}));
    const run=args=>capture(process.execPath,['bin/moonsize.mjs',...args]);
    let r=run(['analyze',file,'--why','1','--json']);
    assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).explanation.edges[0].target,1);
    r=run(['diff',file,file,'--why','1','--max-bytes','0']);
    assert.equal(r.status,1);assert.match(r.stdout,/Direct callers \(1\)/);assert.match(r.stdout,/Function matching/);
    for(const value of ['-1','1.5','2','2147483648'])assert.equal(run(['analyze',file,'--why',value]).status,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('real worker returns the same L2/L3 data as the CLI core bridge',async()=>{
  const worker=new Worker(new URL('../ui/analyzer.worker.mjs',import.meta.url));
  try{
    await once(worker,'message');
    const a=wasm([{name:'entry'}],{before:[exportFunction('run',0)]});
    const b=wasm([{name:'entry',code:[16,1]},{name:'leaf'}],{before:[exportFunction('run',0)]});
    const expected=JSON.parse(compare_json(a,b));
    const result=once(worker,'message');
    worker.postMessage({id:1,before:a.buffer,after:b.buffer},[a.buffer,b.buffer]);
    assert.deepEqual((await result)[0].result,expected);
  }finally{await worker.terminate();}
});
