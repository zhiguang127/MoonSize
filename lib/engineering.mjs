import {open, realpath, stat, lstat, readlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzip, brotliCompress, constants} from 'node:zlib';
import {promisify} from 'node:util';
import {size_budget_json} from '../_build/js/release/build/moonsize.js';

const maxInt = 2147483647;
const conditionKeys = ['compiler','target','profile','strip','flags','dependencies_hash'];
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
function integer(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > maxInt) throw new Error(`${label} must be an integer from 0 to ${maxInt}`);
}
export async function readBounded(file, maxBytes) {
  const handle = await open(file,'r');
  try {
    const info = await handle.stat(), size = info.size;
    if (!info.isFile()) throw new Error('Input must be a regular file');
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) throw new Error(`Input exceeds limit ${maxBytes} bytes`);
    const data = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const {bytesRead} = await handle.read(data,offset,size-offset,offset);
      if (!bytesRead) throw new Error('Input changed while reading');
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error('Input changed while reading');
    return data;
  } finally { await handle.close(); }
}
export async function readConfig(file) {
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(file,65536)));
}
export function parsePolicy(value = {schema_version:1}) {
  object(value,['schema_version','require_comparable','budgets'],'policy');
  if (value.schema_version !== 1) throw new Error('Unsupported policy schema_version');
  if (value.require_comparable !== undefined && typeof value.require_comparable !== 'boolean') throw new Error('require_comparable must be boolean');
  const budgets = value.budgets === undefined ? {} : value.budgets;
  object(budgets,['raw','gzip','brotli'],'budgets');
  for (const [metric, limits] of Object.entries(budgets)) {
    object(limits,['max_bytes','max_growth_bytes'],metric);
    if (!Object.keys(limits).length) throw new Error(`${metric} budget must contain a limit`);
    for (const [key,n] of Object.entries(limits)) integer(n,`${metric}.${key}`);
  }
  return {schema_version:1,require_comparable:value.require_comparable ?? false,budgets:structuredClone(budgets)};
}
export function buildInfo(value) {
  object(value,['schema_version',...conditionKeys,'source_revision'],'build info');
  if (value.schema_version !== 1) throw new Error('Unsupported build info schema_version');
  const result = {schema_version:1};
  for (const key of [...conditionKeys,'source_revision']) {
    const v = value[key] ?? null;
    if (v !== null) {
      if (key === 'strip') { if (typeof v !== 'boolean') throw new Error('strip must be boolean'); }
      else if (key === 'flags') {
        if (!Array.isArray(v) || v.length > 128 || v.some(s=>typeof s!=='string'||s.length>1024)) throw new Error('flags must be an ordered array of up to 128 strings (1024 characters each)');
      } else if (typeof v !== 'string' || !v.trim() || v.length>4096) throw new Error(`${key} must be a nonempty string (up to 4096 characters)`);
    }
    if (key === 'dependencies_hash' && v !== null && !/^[a-f0-9]{64}$/.test(v)) throw new Error('dependencies_hash must be a lowercase SHA-256');
    result[key] = v;
  }
  // Every emitted record can be read back through the bounded JSON reader.
  if (Buffer.byteLength(JSON.stringify(result)) > 60000) throw new Error('Build info exceeds record size limit');
  return result;
}
const artifact = data => ({bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
export function createBuildRecord(data, info) {
  return {schema_version:1,artifact:artifact(data),build:buildInfo(info)};
}
export function verifyBuildRecord(value, data) {
  object(value,['schema_version','artifact','build'],'build record');
  if (value.schema_version !== 1) throw new Error('Unsupported build record schema_version');
  object(value.artifact,['bytes','sha256'],'artifact');
  const expected = artifact(data);
  if (value.artifact.bytes !== expected.bytes || value.artifact.sha256 !== expected.sha256) throw new Error('Build record does not match input artifact (bytes/SHA-256)');
  return createBuildRecord(data,value.build);
}
export function compareBuilds(before, after) {
  const differences = [], missing = [];
  for (const key of conditionKeys) {
    const a=before?.build[key] ?? null, b=after?.build[key] ?? null;
    if (a === null || b === null) missing.push({field:key,before:a===null,after:b===null});
    else if (JSON.stringify(a)!==JSON.stringify(b)) differences.push({field:key,before:a,after:b});
  }
  return {status:differences.length?'different':missing.length?'unknown':'matching',differences,missing};
}
export const compressionSettings = Object.freeze({
  gzip:Object.freeze({level:9,windowBits:15,memLevel:8,strategy:0}),
  brotli:Object.freeze({quality:6,lgwin:22,mode:'generic'}),
});
const gzipAsync=promisify(gzip), brotliAsync=promisify(brotliCompress);
export async function measureSizes(before, after, compressed) {
  const metric=(a,b)=>({before_bytes:a,after_bytes:b,delta_bytes:a===null?null:b-a});
  const metrics={raw:metric(before?.length??null,after.length),gzip:null,brotli:null};
  if (compressed) {
    for (const name of ['gzip','brotli']) {
      const compress = name==='gzip' ? data=>gzipAsync(data,compressionSettings.gzip) : data=>brotliAsync(data,{params:{
        [constants.BROTLI_PARAM_QUALITY]:compressionSettings.brotli.quality,
        [constants.BROTLI_PARAM_LGWIN]:compressionSettings.brotli.lgwin,
        [constants.BROTLI_PARAM_MODE]:constants.BROTLI_MODE_GENERIC,
      }});
      const a=before ? (await compress(before)).length : null;
      const b=(await compress(after)).length;
      metrics[name]=metric(a,b);
    }
  }
  return {metrics,compression:compressed ? {settings:compressionSettings,implementation:{node:process.versions.node,zlib:process.versions.zlib,brotli:process.versions.brotli}} : null};
}
export function evaluatePolicy(policy, delivery, comparability) {
  const checks=[], violations=[];
  for (const [metric,limits] of Object.entries(policy.budgets)) {
    const sizes=delivery.metrics[metric];
    if (!sizes || sizes.before_bytes===null) throw new Error(`${metric} budget requires both measured artifacts`);
    // All budget arithmetic and inclusive-limit decisions stay in MoonBit.
    for (const n of [sizes.before_bytes,sizes.after_bytes]) integer(n,'Measured size');
    const result=JSON.parse(size_budget_json(sizes.before_bytes,sizes.after_bytes,limits.max_bytes??-1,limits.max_growth_bytes??-1));
    if (!result.ok) throw new Error(result.error.message);
    checks.push({metric,...result.budget});
    violations.push(...result.budget.violations.map(message=>({scope:metric,message})));
  }
  if (policy.require_comparable && comparability.status!=='matching') violations.push({scope:'comparability',message:`Reported build conditions are ${comparability.status}; matching conditions are required`});
  return {status:violations.length?'fail':checks.length||policy.require_comparable?'pass':'not_configured',checks,violations};
}
export async function protectOutputs(outputs, inputs) {
  const canonicalize=async (file,links=0)=>{
    if(links>40)throw new Error('Too many output path symlinks');
    try{return await realpath(file);}catch(e){if(e.code!=='ENOENT')throw e;}
    const info=await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(info?.isSymbolicLink())return canonicalize(path.resolve(path.dirname(file),await readlink(file)),links+1);
    // Existing ancestors can be links even when the output itself does not exist.
    return path.join(await canonicalize(path.dirname(file),links),path.basename(file));
  };
  const identify=async file=>{
    const resolved=path.resolve(file);
    const info=await stat(resolved).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if (info && !info.isFile()) throw new Error('Output and input paths must be regular files');
    const canonical=await canonicalize(resolved);
    return {canonical:process.platform==='win32'?canonical.toLowerCase():canonical,info};
  };
  const seen=await Promise.all(inputs.map(identify));
  for (const output of outputs) {
    const id=await identify(output);
    if (seen.some(other=>other.canonical===id.canonical||(id.info&&other.info&&id.info.dev===other.info.dev&&id.info.ino===other.info.ino))) throw new Error('Output must not overwrite an input or another output');
    seen.push(id);
  }
}
