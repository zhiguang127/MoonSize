import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,link,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {capture} from '../scripts/process.mjs';
import {compare_json,size_budget_json} from '../_build/js/release/build/moonsize.js';
import {parsePolicy,createBuildRecord,verifyBuildRecord,compareBuilds,measureSizes,evaluatePolicy,protectOutputs,readConfig} from '../lib/engineering.mjs';
import {renderSummary} from '../lib/summary.mjs';
import {renderBody} from '../ui/report.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=args=>capture(process.execPath,['bin/moonsize.mjs',...args],{cwd:root});
const empty=Uint8Array.of(0,97,115,109,1,0,0,0),named=Uint8Array.of(...empty,0,3,1,120,65);
const info={schema_version:1,compiler:'moonc test',target:'wasm',profile:'release',strip:false,flags:['--no-strip'],dependencies_hash:'a'.repeat(64),source_revision:'old'};
async function temporary(fn){const dir=await mkdtemp(path.join(tmpdir(),'moonsize-engineering-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('independent measured-size bridge validates signed and inclusive limits',()=>{
  assert.equal(JSON.parse(size_budget_json(10,20,20,10)).budget.passed,true);
  assert.equal(JSON.parse(size_budget_json(20,10,-1,0)).budget.growth_bytes,-10);
  assert.equal(JSON.parse(size_budget_json(-1,10,-1,-1)).ok,false);
  assert.equal(JSON.parse(size_budget_json(1,10,-2,-1)).ok,false);
});
test('policy rejects misspellings, noninteger limits and unsupported versions',()=>{
  for(const value of [{schema_version:2},{schema_version:1,require_comparable:1},{schema_version:1,bugdets:{}},{schema_version:1,budgets:null},{schema_version:1,budgets:{br:{max_bytes:1}}},...[-1,1.1,null,'2',2147483648].map(n=>({schema_version:1,budgets:{raw:{max_bytes:n}}})),{schema_version:1,budgets:{raw:{}}}])assert.throws(()=>parsePolicy(value));
  assert.deepEqual(parsePolicy({schema_version:1,budgets:{raw:{max_growth_bytes:0}}}).budgets.raw,{max_growth_bytes:0});
});
test('records are byte-bound and compare declared conditions without treating commits as flags',()=>{
  const a=createBuildRecord(empty,info),b=createBuildRecord(named,{...info,source_revision:'new'});
  assert.deepEqual(verifyBuildRecord(a,empty),a);
  assert.throws(()=>verifyBuildRecord(a,named),/SHA-256/);
  const changed=empty.slice();changed[7]=1;
  assert.throws(()=>verifyBuildRecord(a,changed),/SHA-256/);
  assert.equal(compareBuilds(a,b).status,'matching');
  assert.equal(compareBuilds(a,createBuildRecord(named,{...info,strip:true})).status,'different');
  assert.equal(compareBuilds(a,createBuildRecord(named,{...info,flags:null})).status,'unknown');
  assert.equal(compareBuilds(null,null).status,'unknown');
  assert.equal(compareBuilds(createBuildRecord(empty,{...info,flags:['a','b']}),createBuildRecord(named,{...info,flags:['b','a']})).status,'different');
  assert.throws(()=>createBuildRecord(empty,{...info,stripped:true}),/Unknown/);
  assert.throws(()=>createBuildRecord(empty,{...info,dependencies_hash:'bad'}),/SHA-256/);
});
test('compression measures both artifacts using recorded parameters, independent of raw growth',async()=>{
  // Larger repetitive bytes compress smaller than a deterministic noisy baseline.
  const a=Buffer.alloc(4096);let state=17;for(let i=0;i<a.length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;a[i]=state>>>24;}
  const b=Buffer.alloc(8192,65),r=await measureSizes(a,b,true);
  assert.ok(r.metrics.raw.delta_bytes>0);assert.ok(r.metrics.gzip.delta_bytes<0);assert.ok(r.metrics.brotli.delta_bytes<0);
  assert.equal(r.metrics.gzip.before_bytes,gzipSync(a,{level:9,windowBits:15,memLevel:8,strategy:0}).length);
  assert.equal(r.metrics.brotli.after_bytes,brotliCompressSync(b,{params:{[constants.BROTLI_PARAM_QUALITY]:6,[constants.BROTLI_PARAM_LGWIN]:22,[constants.BROTLI_PARAM_MODE]:0}}).length);
  assert.deepEqual(await measureSizes(a,b,true),r);
  const single=await measureSizes(null,b,false);
  assert.equal(single.metrics.gzip,null);assert.equal(single.metrics.raw.delta_bytes,null);assert.equal(single.compression,null);
});
test('combined decisions cannot hide compressed failure behind raw success',async()=>{
  const delivery=await measureSizes(empty,named,true),comparability=compareBuilds(null,null);
  const policy=parsePolicy({schema_version:1,budgets:{raw:{max_bytes:13},gzip:{max_bytes:0},brotli:{max_growth_bytes:0}},require_comparable:true});
  const decision=evaluatePolicy(policy,delivery,comparability);
  assert.equal(decision.status,'fail');assert.equal(decision.checks[0].passed,true);
  assert.ok(decision.violations.some(v=>v.scope==='gzip'));assert.ok(decision.violations.some(v=>v.scope==='comparability'));
  assert.throws(()=>evaluatePolicy(policy,{metrics:{raw:delivery.metrics.raw}},comparability),/both measured/);
  assert.equal(evaluatePolicy(parsePolicy(),delivery,comparability).status,'not_configured');
});
test('CLI records, verifies and enforces policies while writing failed JSON, HTML and appended summary',()=>temporary(async dir=>{
  const a=path.join(dir,'before.wasm'),b=path.join(dir,'after.wasm'),config=path.join(dir,'info.json'),policy=path.join(dir,'policy.json');
  const ar=path.join(dir,'a.build.json'),br=path.join(dir,'b.build.json'),summary=path.join(dir,'summary.md'),html=path.join(dir,'report.html');
  await Promise.all([writeFile(a,empty),writeFile(b,named),writeFile(config,JSON.stringify(info)),writeFile(policy,JSON.stringify({schema_version:1,require_comparable:true,budgets:{raw:{max_bytes:13},gzip:{max_bytes:0}}})),writeFile(summary,'Existing summary\n')]);
  for(const [file,record] of [[a,ar],[b,br]]){const r=cli(['record',file,'--build-info',config,'--output',record]);assert.equal(r.status,0,r.stderr);}
  const args=['diff',a,b,'--before-build',ar,'--after-build',br,'--policy',policy,'--json','--summary',summary,'--html',html];
  let r=cli(args);assert.equal(r.status,1,r.stderr);
  const result=JSON.parse(r.stdout);assert.equal(result.engineering.policy.require_comparable,true);assert.equal(result.budget.passed,true);assert.equal(result.engineering.decision.status,'fail');assert.equal(result.engineering.provenance.comparability.status,'matching');
  assert.ok(result.engineering.delivery.metrics.brotli.after_bytes>0);
  const md=await readFile(summary,'utf8');assert.ok(md.startsWith('Existing summary\n'));assert.match(md,/Policy failed/);assert.match(md,/Largest section growth/);
  const report=await readFile(html,'utf8');assert.match(report,/交付体积与构建条件/);assert.match(report,/FAIL/);
  // A successful policy is inclusive at independently observed compressed size.
  await writeFile(policy,JSON.stringify({schema_version:1,require_comparable:true,budgets:{gzip:{max_bytes:result.engineering.delivery.metrics.gzip.after_bytes}}}));
  r=cli(args);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).engineering.decision.status,'pass');
  assert.equal((await readFile(summary,'utf8')).split('## MoonSize').length,3);
  await writeFile(ar,await readFile(br));r=cli(args);assert.equal(r.status,2);assert.match(JSON.parse(r.stdout).error.message,/SHA-256/);
}));
test('CLI strict comparability fails on absent conditions; configuration conflicts are input errors',()=>temporary(async dir=>{
  const file=path.join(dir,'input.wasm'),policy=path.join(dir,'policy.json');
  await writeFile(file,empty);await writeFile(policy,JSON.stringify({schema_version:1,require_comparable:true,budgets:{raw:{max_bytes:8}}}));
  let r=cli(['diff',file,file,'--policy',policy,'--json']);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).engineering.provenance.comparability.status,'unknown');
  r=cli(['diff',file,file,'--policy',policy,'--max-bytes','8','--json']);assert.equal(r.status,2);assert.match(JSON.parse(r.stdout).error.message,/Duplicate/);
  r=cli(['analyze',file,'--compress','--json']);assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).engineering.delivery.metrics.gzip.before_bytes,null);
  for(const args of [['analyze',file,'--before-build',policy],['record',file,'--output',policy],['diff',file,file,'--output',policy]])assert.equal(cli(args).status,2);
}));
test('all output paths protect modules, configurations, hard links and one another before writing',()=>temporary(async dir=>{
  const input=path.join(dir,'input.wasm'),alias=path.join(dir,'alias'),summary=path.join(dir,'new.md');await writeFile(input,empty);await link(input,alias);
  let r=cli(['analyze',input,'--html',summary,'--summary',alias]);assert.equal(r.status,2);await assert.rejects(readFile(summary),{code:'ENOENT'});assert.deepEqual(new Uint8Array(await readFile(input)),empty);
  await assert.rejects(protectOutputs([summary,summary],[input]),/another output/);
  if(process.platform!=='win32'){
    const actual=path.join(dir,'actual'),linked=path.join(dir,'linked');await mkdir(actual);await symlink(actual,linked);
    await assert.rejects(protectOutputs([path.join(actual,'new.html'),path.join(linked,'new.html')],[input]),/another output/);
    await symlink(input,path.join(dir,'input-link'));await assert.rejects(protectOutputs([path.join(dir,'input-link')],[input]),/overwrite/);
    const dangling=path.join(dir,'dangling');await symlink(summary,dangling);
    await assert.rejects(protectOutputs([summary,dangling],[input]),/another output/);
  }
  const policy=path.join(dir,'policy.json');await writeFile(policy,'{"schema_version":1}');r=cli(['diff',input,input,'--policy',policy,'--summary',policy]);assert.equal(r.status,2);assert.equal(await readFile(policy,'utf8'),'{"schema_version":1}');
}));
test('JSON configuration has a strict bounded reader',()=>temporary(async dir=>{
  const file=path.join(dir,'config.json');await writeFile(file,' '.repeat(65537));await assert.rejects(readConfig(file),/limit/);
  await writeFile(file,Buffer.from([255,254]));await assert.rejects(readConfig(file));
}));
test('summaries bound and escape binary names; HTML shows combined policy and unknown browser metrics',async()=>{
  const result=JSON.parse(compare_json(empty,named));const delivery=await measureSizes(empty,named,true),provenance={before:null,after:null,comparability:compareBuilds(null,null)};
  const decision=evaluatePolicy(parsePolicy({schema_version:1,budgets:{raw:{max_bytes:13},brotli:{max_bytes:0}}}),delivery,provenance.comparability);
  result.engineering={schema_version:1,delivery,provenance,decision};result.budget=decision.checks[0];
  const malicious='</script><img src=x onerror=alert(1)>|[click](https://evil.test)\n# forged';
  result.comparison.sections[0].custom_name=malicious.repeat(10000);
  const summary=renderSummary(result,{before:malicious,after:malicious});
  assert.ok(Buffer.byteLength(summary)<20000);assert.doesNotMatch(summary,/<img|\[click\]|\n# forged/);
  const html=renderBody(result,{},'en');assert.match(html,/<strong class="up">FAIL<\/strong>/);
  delete result.engineering;const browser=renderBody(result,{},'zh');assert.match(browser,/未测量/);assert.match(browser,/声明的构建条件: 未知/);
});
