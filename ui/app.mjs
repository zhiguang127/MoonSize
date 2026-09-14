import {AnalysisClient} from './analysis-client.mjs';
import {styles,renderBody,renderReport} from './report.mjs';
const style=document.createElement('style');style.textContent=styles;document.head.append(style);
const $=id=>document.getElementById(id);
let last,lastFiles,active;
let generation=0;
const limit=id=>{
  const s=$(id).value;
  if(!s)return -1;
  if(!/^(0|[1-9][0-9]*)$/.test(s)||Number(s)>2147483647)throw new Error('预算必须为 0～2147483647 的整数字节数');
  return Number(s);
};
function controls(busy){$('analyze').disabled=busy;$('demo').disabled=busy;$('case').disabled=busy;$('cancel').disabled=!busy;}
async function run(load){
  const token=++generation;
  last=undefined;$('report').replaceChildren();$('download').disabled=true;controls(true);
  $('status').textContent='正在准备分析 Worker…';
  let client;
  try{
    const max=limit('maxBytes'),growth=limit('maxGrowth');
    client=new AnalysisClient();active=client;
    const limits=await client.ready;
    $('status').textContent='正在读取文件…';
    const {before,after,files}=await load(limits);
    if(token!==generation)return;
    if(!before&&(max!==-1||growth!==-1))throw new Error('检查预算需要同时选择基准构建');
    $('status').textContent='正在 Worker 中分析，可随时取消…';
    const result=await client.run(before,after,max,growth);
    if(token!==generation)return;
    if(!result.ok)throw new Error('字节 '+result.error.offset+'：'+result.error.message);
    last=result;lastFiles=files;
    $('report').innerHTML=renderBody(result,files);
    $('download').disabled=false;
    $('status').textContent=result.budget&&!result.budget.passed?'分析完成，超过预算。':'分析完成。';
  }catch(error){if(token===generation)$('status').textContent=error.message;}
  finally{client?.close();if(token===generation){active=undefined;controls(false);}}
}
async function read(file,limits){
  if(file.size>limits.max_input_bytes)throw new Error('每个文件最多 '+limits.max_input_bytes/1024/1024+' MiB');
  return file.arrayBuffer();
}
$('cancel').onclick=()=>{
  generation++;active?.cancel();active=undefined;controls(false);
  $('status').textContent='分析已取消，可重新选择文件。';
};
$('analyze').onclick=()=>run(async limits=>{
  const a=$('after').files[0],b=$('before').files[0];
  if(!a)throw new Error('请选择当前构建的 .wasm 文件');
  return {before:b?await read(b,limits):null,after:await read(a,limits),files:{input:a.name,after:a.name,before:b?.name}};
});
$('demo').onclick=()=>run(async limits=>{
  const load=async name=>{
    const r=await fetch('../reports/demo/'+name+'.wasm');
    if(!r.ok)throw new Error('请先在项目目录运行 npm run demo');
    const data=await r.arrayBuffer();
    if(data.byteLength>limits.max_input_bytes)throw new Error('示例超过输入限制');
    return data;
  };
  const [before,after]=await Promise.all([load('before'),load('after')]);
  return {before,after,files:{before:'before.wasm · release --no-strip',after:'after.wasm · release --no-strip'}};
});
$('case').onclick=()=>run(async limits=>{
  const load=async stage=>{
    const response=await fetch('../reports/cases/cmark-'+stage+'.wasm');
    if(!response.ok)throw new Error('请先在项目目录运行 python scripts/build-cases.py');
    const data=await response.arrayBuffer();
    if(data.byteLength>limits.max_input_bytes)throw new Error('案例超过输入限制');
    return data;
  };
  const [before,after]=await Promise.all([load('before'),load('after')]);
  return {before,after,files:{before:'CommonMark ebf47ab · 原始实体表',after:'CommonMark ebf47ab · 有序数组与二分查找 · 相同 release --no-strip'}};
});
$('download').onclick=()=>{
  if(!last)return;
  const url=URL.createObjectURL(new Blob([renderReport(last,lastFiles)],{type:'text/html'}));
  const link=document.createElement('a');link.href=url;link.download='moonsize-report.html';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
