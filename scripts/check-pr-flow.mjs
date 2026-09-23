import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {capture} from './process.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(path.join(tmpdir(),'moonsize-pr-check-'));
function run(command,args,expected=0){
  const result=capture(command,args,{cwd:root});
  assert.equal(result.status,expected,result.stderr||result.stdout);
  return result;
}
async function wasmFiles(directory){
  const found=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const name=path.join(directory,entry.name);
    if(entry.isDirectory())found.push(...await wasmFiles(name));
    else if(entry.name.endsWith('.wasm'))found.push(name);
  }
  return found;
}
async function build(side,revision){
  const project=path.join(dir,side),target=path.join(dir,`${side}-target`),artifact=path.join(dir,`${side}.wasm`),info=path.join(dir,`${side}.info.json`),record=path.join(dir,`${side}.build.json`);
  const result=capture('moon',['build','--target','wasm-gc','--release','--no-strip','--target-dir',target],{cwd:project});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const files=await wasmFiles(target);assert.equal(files.length,1,'Expected one Wasm artifact');
  await cp(files[0],artifact);
  run(process.execPath,['scripts/write-build-info.mjs','--project',project,'--target','wasm-gc','--strip','false','--source-revision',revision,'--output',info,'--flag','--no-strip']);
  run(process.execPath,['bin/moonsize.mjs','record',artifact,'--build-info',info,'--output',record]);
  return {project,artifact,record};
}
try{
  for(const side of ['baseline','current'])await cp(path.join(root,'examples/after'),path.join(dir,side),{recursive:true});
  const before=await build('baseline','0'.repeat(40)),after=await build('current','1'.repeat(40));
  assert.deepEqual(await readFile(before.artifact),await readFile(after.artifact));
  const policy=path.join(dir,'policy.json'),resultFile=path.join(dir,'result.json');
  await writeFile(policy,JSON.stringify({schema_version:1,require_comparable:true,budgets:{raw:{max_growth_bytes:0}}}));
  const args=['diff',before.artifact,after.artifact,'--before-build',before.record,'--after-build',after.record,'--policy',policy,'--json-file',resultFile];
  run(process.execPath,['bin/moonsize.mjs',...args]);
  let result=JSON.parse(await readFile(resultFile,'utf8'));
  assert.equal(result.engineering.decision.status,'pass');
  assert.equal(result.engineering.provenance.comparability.status,'matching');
  run(process.execPath,['bin/moonsize.mjs',...args,'--max-bytes','0'],1);
  result=JSON.parse(await readFile(resultFile,'utf8'));
  assert.equal(result.engineering.decision.status,'fail');
  const mod=path.join(after.project,'moon.mod');
  await writeFile(mod,(await readFile(mod,'utf8')).replace('0.0.0','0.0.1'));
  await build('current','1'.repeat(40));
  run(process.execPath,['bin/moonsize.mjs',...args],1);
  result=JSON.parse(await readFile(resultFile,'utf8'));
  assert.equal(result.engineering.provenance.comparability.status,'different');
  run(process.execPath,['bin/moonsize.mjs','diff',path.join(dir,'missing.wasm'),after.artifact,'--json-file',resultFile],2);
  assert.equal(JSON.parse(await readFile(resultFile,'utf8')).ok,false);
  await writeFile(after.artifact,Uint8Array.of(0,1,2));
  run(process.execPath,['bin/moonsize.mjs',...args],2);
  assert.equal(JSON.parse(await readFile(resultFile,'utf8')).ok,false);
  console.log('PR flow check passed: matching, budget failure, changed conditions, missing baseline, damaged artifact.');
}finally{await rm(dir,{recursive:true,force:true});}
