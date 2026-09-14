import {AnalysisClient} from './analysis-client.mjs';
import {normalizeLocale,uiMessages} from './i18n.mjs';
import {styles,renderBody,renderReport} from './report.mjs';

const style=document.createElement('style');style.textContent=styles;document.head.append(style);
const $=id=>document.getElementById(id);
const localeKey='moonsize-locale';
const savedLocale=()=>{try{return localStorage.getItem(localeKey);}catch{return null;}};
let locale=normalizeLocale(savedLocale()||navigator.languages?.[0]||navigator.language||'zh');
let last,lastFiles,active;
let generation=0;
let status={key:'idle',args:[]};

const copy=()=>uiMessages[locale];
const translated=(key,args=[])=>{
  const value=copy()[key];
  return typeof value==='function'?value(...args):value;
};
const setStatus=(key,...args)=>{
  status={key,args};
  $('status').textContent=translated(key,args);
};
const uiError=(key,...args)=>{
  const error=new Error(translated(key,args));
  error.uiStatus={key,args};
  return error;
};
const localizedFiles=files=>{
  if(!files)return {};
  return {
    ...files,
    before:files.beforeKey?translated(files.beforeKey):files.before,
    after:files.afterKey?translated(files.afterKey):files.after,
  };
};
function applyLocale(){
  const text=copy();
  document.documentElement.lang=text.lang;
  document.title=text.title;
  for(const id of ['localBadge','headline','intro','afterLabel','beforeLabel','maxBytesLabel','maxGrowthLabel','analyze','case','demo','cancel','download'])$(id).textContent=text[id];
  $('maxBytes').placeholder=text.noLimit;
  $('maxGrowth').placeholder=text.noLimit;
  $('language').textContent=text.switchLabel;
  $('language').setAttribute('aria-label',text.switchAria);
  if(last)$('report').innerHTML=renderBody(last,localizedFiles(lastFiles),locale);
  setStatus(status.key,...status.args);
}
const limit=id=>{
  const value=$(id).value;
  if(!value)return -1;
  if(!/^(0|[1-9][0-9]*)$/.test(value)||Number(value)>2147483647)throw uiError('invalidBudget');
  return Number(value);
};
function controls(busy){$('analyze').disabled=busy;$('demo').disabled=busy;$('case').disabled=busy;$('cancel').disabled=!busy;}
async function run(load){
  const token=++generation;
  last=undefined;$('report').replaceChildren();$('download').disabled=true;controls(true);
  setStatus('preparing');
  let client;
  try{
    const max=limit('maxBytes'),growth=limit('maxGrowth');
    client=new AnalysisClient();active=client;
    const limits=await client.ready;
    setStatus('reading');
    const {before,after,files}=await load(limits);
    if(token!==generation)return;
    if(!before&&(max!==-1||growth!==-1))throw uiError('budgetNeedsBaseline');
    setStatus('analyzing');
    const result=await client.run(before,after,max,growth);
    if(token!==generation)return;
    if(!result.ok)throw uiError('parseError',result.error.offset,result.error.message);
    last=result;lastFiles=files;
    $('report').innerHTML=renderBody(result,localizedFiles(files),locale);
    $('download').disabled=false;
    setStatus(result.budget&&!result.budget.passed?'completeOverBudget':'complete');
  }catch(error){
    if(token===generation){
      if(error.uiStatus)setStatus(error.uiStatus.key,...error.uiStatus.args);
      else if(error.code&&copy()[error.code])setStatus(error.code);
      else setStatus('rawError',error.message);
    }
  }finally{client?.close();if(token===generation){active=undefined;controls(false);}}
}
async function read(file,limits){
  if(file.size>limits.max_input_bytes)throw uiError('fileTooLarge',limits.max_input_bytes/1024/1024);
  return file.arrayBuffer();
}

$('language').onclick=()=>{
  locale=locale==='zh'?'en':'zh';
  try{localStorage.setItem(localeKey,locale);}catch{}
  applyLocale();
};
$('cancel').onclick=()=>{
  generation++;active?.cancel();active=undefined;controls(false);
  setStatus('cancelled');
};
$('analyze').onclick=()=>run(async limits=>{
  const after=$('after').files[0],before=$('before').files[0];
  if(!after)throw uiError('selectCurrent');
  return {before:before?await read(before,limits):null,after:await read(after,limits),files:{input:after.name,after:after.name,before:before?.name}};
});
$('demo').onclick=()=>run(async limits=>{
  const load=async name=>{
    const response=await fetch('../reports/demo/'+name+'.wasm');
    if(!response.ok)throw uiError('demoUnavailable');
    const data=await response.arrayBuffer();
    if(data.byteLength>limits.max_input_bytes)throw uiError('exampleTooLarge');
    return data;
  };
  const [before,after]=await Promise.all([load('before'),load('after')]);
  return {before,after,files:{beforeKey:'demoBefore',afterKey:'demoAfter'}};
});
$('case').onclick=()=>run(async limits=>{
  const load=async stage=>{
    const response=await fetch('../reports/cases/cmark-'+stage+'.wasm');
    if(!response.ok)throw uiError('caseUnavailable');
    const data=await response.arrayBuffer();
    if(data.byteLength>limits.max_input_bytes)throw uiError('caseTooLarge');
    return data;
  };
  const [before,after]=await Promise.all([load('before'),load('after')]);
  return {before,after,files:{beforeKey:'caseBefore',afterKey:'caseAfter'}};
});
$('download').onclick=()=>{
  if(!last)return;
  const url=URL.createObjectURL(new Blob([renderReport(last,localizedFiles(lastFiles),locale)],{type:'text/html'}));
  const link=document.createElement('a');link.href=url;link.download='moonsize-report.html';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

applyLocale();
