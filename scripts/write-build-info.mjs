#!/usr/bin/env node
// Capture actual build conditions for a project checked out at a known revision.
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {capture} from './process.mjs';

const usage='Usage: node scripts/write-build-info.mjs --project DIR --target TARGET --strip true|false --source-revision SHA --output FILE [--flag VALUE ...]';
const args=process.argv.slice(2),options=new Map(),flags=[];
while(args.length){
  const key=args.shift(),value=args.shift();
  if(!key?.startsWith('--')||value===undefined)throw new Error(usage);
  if(key==='--flag'){flags.push(value);continue;}
  if(!['--project','--target','--strip','--source-revision','--output'].includes(key)||options.has(key))throw new Error(usage);
  options.set(key,value);
}
for(const key of ['--project','--target','--strip','--source-revision','--output'])if(!options.has(key))throw new Error(usage);
if(!['true','false'].includes(options.get('--strip')))throw new Error('--strip must be true or false');
const project=path.resolve(options.get('--project'));
const moonHome=process.env.MOON_HOME??path.join(process.env.HOME??process.env.USERPROFILE,'.moon');
const hash=createHash('sha256');
const excluded=new Set(['_build','target','dist','node_modules','.git','.local']);
async function fingerprint(label,dir,filter){
  async function visit(relative=''){
    for(const entry of (await readdir(path.join(dir,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      if(excluded.has(entry.name)||entry.name.startsWith('.')&&entry.name!=='.mooncakes')continue;
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isDirectory())await visit(name);
      else if(entry.isFile()&&filter(entry.name)){
        hash.update(`${label}/${name}\0`);
        hash.update(createHash('sha256').update(await readFile(path.join(dir,name))).digest());
      }
    }
  }
  await visit();
}
const source=name=>/\.mbti?$/.test(name)||['moon.mod','moon.pkg','moon.mod.json','moon.pkg.json'].includes(name);
await fingerprint('core',path.join(moonHome,'lib/core'),source);
await fingerprint('project',project,name=>['moon.mod','moon.pkg','moon.mod.json','moon.pkg.json','moon.lock','moon.work','moonsize-build.sh'].includes(name));
const version=capture('moon',['version','--all']);
if(version.status!==0)throw new Error(version.stderr||'moon version failed');
const info={schema_version:1,compiler:version.stdout.trim(),target:options.get('--target'),profile:'release',strip:options.get('--strip')==='true',flags,dependencies_hash:hash.digest('hex'),source_revision:options.get('--source-revision')};
const output=path.resolve(options.get('--output'));
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(info,null,2)+'\n');
console.log(`Build info: ${output}`);
