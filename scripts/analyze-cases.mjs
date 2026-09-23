import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {capture} from './process.mjs';
import {analyze_json,compare_json} from '../_build/js/release/build/moonsize.js';
const dir=new URL('../reports/cases/',import.meta.url);
const upstream=new URL('../.local/real-cases/upstream/cmark/',import.meta.url);
const sha=data=>createHash('sha256').update(data).digest('hex');
async function analyze(file){
  const data=new Uint8Array(await readFile(new URL(file,dir)));
  assert.ok(WebAssembly.validate(data),`${file}: independent engine validation`);
  const result=JSON.parse(analyze_json(data));assert.ok(result.ok,JSON.stringify(result.error));
  const a=result.analysis;
  assert.equal(a.module_header_bytes+a.sections.reduce((n,s)=>n+s.total_bytes,0),data.length);
  assert.deepEqual(a.warnings,[]);
  assert.deepEqual(a.references.issues,[],`${file}: reference decoding issues`);
  assert.equal(a.references.decoded_functions,a.functions.length);
  await writeFile(new URL(file+'.json',dir),JSON.stringify(result,null,2)+'\n');
  const stats={file,bytes:data.length,sha256:sha(data),functions:a.functions.length,symbols:{},top_functions:a.functions.toSorted((a,b)=>b.total_bytes-a.total_bytes||a.ordinal-b.ordinal).slice(0,10).map(f=>({bytes:f.total_bytes,symbol:f.symbol?.display??null}))};
  for(const f of a.functions){const status=f.symbol?.status??'absent';stats.symbols[status]=(stats.symbols[status]??0)+1;}
  stats.references={decoded_functions:a.references.decoded_functions,edges:a.references.edges.length,dynamic_calls:a.references.dynamic_references.length};
  return {data,result,stats};
}
const before=await analyze('cmark-before.wasm');
if(process.argv.includes('--baseline')){
  console.log(JSON.stringify(before.stats,null,2));process.exit(0);
}
const after=await analyze('cmark-after.wasm'),toml=await analyze('toml-cli.wasm');
const strippedBefore=await analyze('cmark-before-stripped.wasm'),strippedAfter=await analyze('cmark-after-stripped.wasm');
const diff=JSON.parse(compare_json(before.data,after.data));assert.ok(diff.ok);
assert.equal(diff.comparison.packages.reduce((n,p)=>n+p.before_bytes,0),diff.comparison.matching.before.total_bytes);
assert.equal(diff.comparison.packages.reduce((n,p)=>n+p.after_bytes,0),diff.comparison.matching.after.total_bytes);
await writeFile(new URL('cmark-diff.json',dir),JSON.stringify(diff,null,2)+'\n');
const modules=await Promise.all(['before','after'].map(async stage=>{
  const data=await readFile(new URL(`cmark-${stage}.wasm`,dir));
  const {instance}=await WebAssembly.instantiate(data,{}, {builtins:['js-string'],importedStringConstants:'_'});
  return {wasm:instance.exports,js:await import(new URL(`cmark-${stage}.mjs`,dir))};
}));
const entities=JSON.parse(await readFile(new URL('src/char/entities.json',upstream),'utf8'));
const spec=await readFile(new URL('src/data/test/spec.md',upstream),'utf8');
// CommonMark 0.31.2's individual examples plus the entire specification.
const examples=[...spec.matchAll(/^`{32} example\r?\n([\s\S]*?)^\.\r?\n[\s\S]*?^`{32}\s*$/gm)].map(m=>m[1].replaceAll('→','\t'));
assert.ok(examples.length>600,'CommonMark example extraction must not silently become empty');
const inputs=['',spec,...examples,...Object.keys(entities).map(name=>`entity ${name} end`),'&doesnotexist; &#0; &#xD800; &#1114112;','[&amp;](https://example.com/?q=&amp; "&copy;")'];
const digest=createHash('sha256');
for(const [index,input] of inputs.entries()){
  const outputs=modules.map(({wasm,js})=>{
    const result=wasm.render(input);assert.equal(wasm.result_is_ok(result),1,`Wasm input ${index}`);
    const output=wasm.result_unwrap(result),jsResult=js.render(input);
    assert.equal(js.result_is_ok(jsResult),true,`JS input ${index}`);
    assert.equal(output,js.result_unwrap(jsResult),`Wasm/JS input ${index}`);return output;
  });
  assert.equal(outputs[0],outputs[1],`before/after input ${index}`);
  digest.update(JSON.stringify([input,outputs[0]])+'\n');
}
assert.ok(after.data.length<before.data.length,'This optimization must show measured savings');
assert.ok(strippedAfter.data.length<strippedBefore.data.length,'Savings must remain after stripping metadata');
const caseFile=name=>fileURLToPath(new URL(name,dir));
const runCli=(args,expected)=>{
  const result=capture(process.execPath,['bin/moonsize.mjs',...args],{cwd:fileURLToPath(new URL('../',import.meta.url))});
  assert.equal(result.status,expected,result.stderr||result.stdout);
};
const beforeFile=caseFile('cmark-before.wasm'),afterFile=caseFile('cmark-after.wasm');
const records=['--before-build',caseFile('cmark-before.wasm.build.json'),'--after-build',caseFile('cmark-after.wasm.build.json')];
const policy=fileURLToPath(new URL('../examples/cmark-policy.json',import.meta.url));
await writeFile(new URL('cmark-summary.md',dir),'');
runCli(['diff',beforeFile,afterFile,...records,'--policy',policy,
  '--json-file',caseFile('cmark-ci.json'),'--html',caseFile('cmark-report.html'),
  '--summary',caseFile('cmark-summary.md')],0);
const engineering=JSON.parse(await readFile(new URL('cmark-ci.json',dir),'utf8')).engineering;
assert.equal(engineering.provenance.comparability.status,'matching');
assert.equal(engineering.decision.status,'pass');
for(const metric of ['raw','gzip','brotli'])assert.ok(engineering.delivery.metrics[metric].delta_bytes<0);
await writeFile(new URL('cmark-policy-fail-summary.md',dir),'');
runCli(['diff',beforeFile,afterFile,...records,'--policy',policy,'--max-bytes','0',
  '--json-file',caseFile('cmark-policy-fail.json'),'--summary',caseFile('cmark-policy-fail-summary.md')],1);
const failed=JSON.parse(await readFile(new URL('cmark-policy-fail.json',dir),'utf8'));
assert.equal(failed.engineering.decision.status,'fail');
runCli(['analyze',caseFile('toml-cli.wasm'),'--compress','--after-build',caseFile('toml-cli.wasm.build.json'),
  '--json-file',caseFile('toml-ci.json'),'--html',caseFile('toml-report.html')],0);
const manifest={toolchain:(await readFile(new URL('toolchain.log',dir),'utf8')).trim(),engineering:{decision:engineering.decision.status,comparability:engineering.provenance.comparability.status,metrics:engineering.delivery.metrics,forced_failure:failed.engineering.decision.status},artifacts:[before.stats,after.stats,strippedBefore.stats,strippedAfter.stats,toml.stats],optimization:{delta_bytes:after.data.length-before.data.length,saved_percent:(before.data.length-after.data.length)*100/before.data.length,code_delta_bytes:diff.comparison.sections.find(s=>s.id===10).delta_bytes,stripped:{before_bytes:strippedBefore.data.length,after_bytes:strippedAfter.data.length,delta_bytes:strippedAfter.data.length-strippedBefore.data.length},section_deltas:diff.comparison.sections,behavior:{inputs:inputs.length,commonmark_examples:examples.length,entity_spellings:Object.keys(entities).length,targets:['wasm-gc','js'],all_outputs_equal:true,corpus_and_output_sha256:digest.digest('hex')}}};
await writeFile(new URL('manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
