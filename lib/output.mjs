import {mkdir,open,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

// The CLI validates output aliases before calling this function. A fresh sibling
// file ensures a failed write cannot leave a half-written JSON result behind.
export async function atomicWriteJson(file,value){
  const output=path.resolve(file);
  await mkdir(path.dirname(output),{recursive:true});
  const temporary=path.join(path.dirname(output),`.${path.basename(output)}.${randomUUID()}.tmp`);
  try{
    const handle=await open(temporary,'wx',0o600);
    try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');}
    finally{await handle.close();}
    await rename(temporary,output);
  }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
