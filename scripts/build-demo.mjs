import {spawnSync} from 'node:child_process';
import {capture} from './process.mjs';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root = fileURLToPath(new URL('../',import.meta.url));
const output = path.join(root,'reports/demo');
await mkdir(output,{recursive:true});
function moon(args,cwd=root) {
  const r = capture('moon',args,{cwd});
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `moon exited ${r.status}`);
  return r.stdout.trim();
}
async function wasmFiles(dir) {
  const all = [];
  for (const e of await readdir(dir,{withFileTypes:true})) {
    const file = path.join(dir,e.name);
    if (e.isDirectory()) all.push(...await wasmFiles(file));
    else if (e.name.endsWith('.wasm')) all.push(file);
  }
  return all;
}
moon(['build','--target','js','--release','--deny-warn']);
const {analyze_json} = await import('../_build/js/release/build/moonsize.js');
const {createBuildRecord} = await import('../lib/engineering.mjs');
// Hash the installed core sources/configuration, not an assumed pinned version.
async function coreFingerprint(dir) {
  const hash=createHash('sha256');
  async function visit(relative='') {
    for(const entry of (await readdir(path.join(dir,relative),{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      if(entry.name.startsWith('.') || entry.name==='_build')continue;
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isDirectory())await visit(name);
      else if(entry.isFile() && (/\.mbti?$/.test(entry.name)||entry.name==='moon.mod'||entry.name==='moon.pkg')){
        hash.update(name+'\0');hash.update(createHash('sha256').update(await readFile(path.join(dir,name))).digest());
      }
    }
  }
  await visit();return hash.digest('hex');
}
const moonHome=process.env.MOON_HOME??path.join(process.env.HOME??process.env.USERPROFILE,'.moon');
const dependenciesHash=await coreFingerprint(path.join(moonHome,'lib/core'));
const compiler=moon(['version','--all']).split('\n').map(line=>line.replace(/^((?:moon|moonc|moonrun) .+?\([^)]*\))\s+.*$/, '$1')).join('\n');
const revision=capture('git',['rev-parse','HEAD'],{cwd:root});
const dirty=capture('git',['status','--porcelain'],{cwd:root});
const sourceRevision=revision.status===0?revision.stdout.trim()+(dirty.status!==0||dirty.stdout.trim()?' (working tree modified)':''):null;

const manifest = {moon_version:moon(['version']),command:'moon build --target TARGET --release (--strip | --no-strip)',fixtures:[]};
for (const version of ['before','after']) {
  for (const target of ['wasm','wasm-gc']) {
    for (const names of [true,false]) {
      const build = path.join(output,'build',`${version}-${target}-${names?'names':'stripped'}`);
      moon(['build','--target',target,'--release',names?'--no-strip':'--strip','--deny-warn','--target-dir',build],path.join(root,'examples',version));
      const found = await wasmFiles(build);
      if (found.length !== 1) throw new Error(`Expected one Wasm output, got ${found.length}`);
      const filename = `${version}-${target}-${names?'names':'stripped'}.wasm`;
      const dest = path.join(output,filename);
      await copyFile(found[0],dest);
      const data = new Uint8Array(await readFile(dest));
      const result = JSON.parse(analyze_json(data));
      if (!result.ok) throw new Error(`${filename}: ${JSON.stringify(result.error)}`);
      const a = result.analysis;
      if (a.module_header_bytes+a.sections.reduce((n,s)=>n+s.total_bytes,0)!==data.length) throw new Error('Section accounting mismatch');
      if (a.warnings.length) throw new Error(`${filename}: ${a.warnings.join('; ')}`);
      if (a.references.issues.length || a.references.decoded_functions !== a.functions.length) throw new Error(`${filename}: incomplete reference decoding: ${JSON.stringify(a.references.issues)}`);
      const engineValid = WebAssembly.validate(data);
      if (!engineValid) throw new Error(`${filename}: Node's WebAssembly validator rejected compiler output`);
      const record=createBuildRecord(data,{schema_version:1,compiler,target,profile:'release',strip:!names,flags:['--deny-warn'],dependencies_hash:dependenciesHash,source_revision:sourceRevision});
      const recordName=filename+'.build.json';
      await writeFile(path.join(output,recordName),JSON.stringify(record,null,2)+'\n');
      manifest.fixtures.push({file:filename,build_record:recordName,target,names,bytes:data.length,functions:a.functions.length,named_functions:a.functions.filter(f=>f.name!==null).length,references:{decoded_functions:a.references.decoded_functions,edges:a.references.edges.length,dynamic_calls:a.references.dynamic_references.length},engine_validated:engineValid,sha256:createHash('sha256').update(data).digest('hex')});
      if (target==='wasm' && names) {
        await copyFile(dest,path.join(output,`${version}.wasm`));
        await copyFile(path.join(output,recordName),path.join(output,`${version}.build.json`));
      }
      console.log(`${filename}: ${data.length} B, ${a.functions.length} functions, warnings=0`);
    }
  }
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const r=spawnSync(process.execPath,['bin/moonsize.mjs','diff','reports/demo/before.wasm','reports/demo/after.wasm','--html','reports/demo/report.html','--compress','--before-build','reports/demo/before.build.json','--after-build','reports/demo/after.build.json'],{cwd:root,stdio:'inherit',windowsHide:true});
if(r.status!==0) process.exitCode=r.status??2;
