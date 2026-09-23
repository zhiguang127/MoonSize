import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {capture} from './process.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=await mkdtemp(path.join(tmpdir(),'moonsize-package-'));
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(command,args,cwd=root){
  const result=capture(command,args,{cwd});
  assert.equal(result.status,0,result.stderr||result.stdout);
  return result.stdout;
}
function cli(bin,args,expected){
  const result=capture(process.execPath,[bin,...args],{cwd:directory});
  assert.equal(result.status,expected,result.stderr||result.stdout);
  return result;
}
try{
  const pack=JSON.parse(run(npm,['pack','--json','--pack-destination',directory]));
  assert.equal(pack.length,1);
  const entries=pack[0].files.map(file=>file.path);
  for(const name of ['bin/moonsize.mjs','lib/engineering.mjs','lib/output.mjs','ui/report.mjs','_build/js/release/build/moonsize.js','LICENSE'])assert.ok(entries.includes(name),`Missing package file: ${name}`);
  assert.ok(entries.every(name=>!name.startsWith('reports/')&&!name.startsWith('tests/')&&!name.startsWith('.local/')));
  const tarball=path.join(directory,pack[0].filename);
  const prefix=path.join(directory,'consumer');
  run(npm,['install','--prefix',prefix,'--offline','--ignore-scripts','--no-audit','--no-fund',tarball],directory);
  const installed=path.join(prefix,'node_modules',pack[0].name);
  const bin=path.join(installed,'bin','moonsize.mjs');
  const command=path.join(prefix,'node_modules','.bin',process.platform==='win32'?'moonsize.cmd':'moonsize');
  await stat(command);
  const entry=process.platform==='win32'?capture('cmd.exe',['/c',command,'--version'],{cwd:directory}):capture(command,['--version'],{cwd:directory});
  assert.equal(entry.status,0,entry.stderr||entry.stdout);
  assert.equal(entry.stdout.trim(),pack[0].version);
  const core=path.join(installed,'_build/js/release/build/moonsize.js');
  await rename(core,core+'.hidden');
  try{
    assert.match(cli(bin,['--help'],0).stdout,/analyze file\.wasm/);
    assert.equal(cli(bin,['--version'],0).stdout.trim(),pack[0].version);
  }finally{await rename(core+'.hidden',core);}
  const before=path.join(root,'reports/demo/before.wasm');
  const after=path.join(root,'reports/demo/after.wasm');
  await stat(before);await stat(after);
  const info=path.join(directory,'build-info.json'),record=path.join(directory,'after.build.json');
  await writeFile(info,JSON.stringify({schema_version:1,compiler:'package check',target:'wasm',profile:'release',strip:false,flags:[],dependencies_hash:null,source_revision:null}));
  cli(bin,['record',after,'--build-info',info,'--output',record],0);
  assert.equal(JSON.parse(await readFile(record,'utf8')).artifact.bytes,(await stat(after)).size);
  const analyze=path.join(directory,'analyze.json');
  cli(bin,['analyze',after,'--json-file',analyze],0);
  assert.equal(JSON.parse(await readFile(analyze,'utf8')).analysis.total_bytes,(await stat(after)).size);
  const result=path.join(directory,'result.json');
  cli(bin,['diff',before,after,'--json-file',result],0);
  assert.equal(JSON.parse(await readFile(result,'utf8')).engineering.decision.status,'not_configured');
  cli(bin,['diff',before,after,'--max-bytes','0','--json-file',result],1);
  assert.equal(JSON.parse(await readFile(result,'utf8')).engineering.decision.status,'fail');
  cli(bin,['diff',before,path.join(directory,'missing.wasm'),'--json-file',result],2);
  assert.equal(JSON.parse(await readFile(result,'utf8')).error.code,'invalid_input');
  console.log(`Package check passed: ${pack[0].filename}; installed outside the repository.`);
}finally{await rm(directory,{recursive:true,force:true});}
