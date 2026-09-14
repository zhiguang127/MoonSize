// Capture through regular files so Windows environments that restrict child
// process named pipes can also run the demo and integration checks.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,openSync,closeSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
export function capture(command,args,options={}) {
  const prefix=path.resolve(tmpdir(),'moonsize-process-');
  const dir=mkdtempSync(prefix);
  const out=path.join(dir,'stdout'),err=path.join(dir,'stderr');
  const stdout=openSync(out,'w'),stderr=openSync(err,'w');
  try {
    const result=spawnSync(command,args,{...options,windowsHide:true,stdio:['ignore',stdout,stderr]});
    return {...result,stdout:readFileSync(out,'utf8'),stderr:readFileSync(err,'utf8')};
  } finally {
    closeSync(stdout);closeSync(stderr);
    if(!path.resolve(dir).startsWith(prefix)) throw new Error('Unexpected temporary directory');
    rmSync(dir,{recursive:true,force:true});
  }
}
