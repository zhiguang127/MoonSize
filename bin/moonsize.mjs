#!/usr/bin/env node
import { writeFile, appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { bytes, signed, renderReport } from '../ui/report.mjs';
import {referencePath} from '../ui/reference-view.mjs';
import {atomicWriteJson} from '../lib/output.mjs';
import {renderSummary} from '../lib/summary.mjs';
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
let jsonOutput=null;
async function writeJsonFile(value){
  if(!jsonOutput)return;
  try{await atomicWriteJson(jsonOutput,value);}
  catch(error){jsonOutput=null;throw error;}
  console.error(`JSON: ${jsonOutput}`);
}

const usage = `MoonSize — inspect WebAssembly build sizes

  node bin/moonsize.mjs analyze file.wasm [--json] [--json-file result.json] [--html report.html]
  node bin/moonsize.mjs diff before.wasm after.wasm [--json] [--json-file result.json] [--html report.html]
      [--max-bytes N] [--max-growth N] [--why FUNCTION_INDEX]
      [--compress] [--policy policy.json] [--summary summary.md]
      [--before-build before.build.json] [--after-build after.build.json]
  node bin/moonsize.mjs record file.wasm --build-info info.json --output file.build.json

--compress measures whole-file gzip (level 9) and Brotli (quality 6).
--summary appends Markdown, including failed policy checks, to the given file.
--json-file writes JSON through the same output-path checks as HTML and summaries.
--policy configures independent raw/gzip/brotli budgets and condition checks.
Build records bind declared conditions to SHA-256; missing conditions remain unknown.

--why inspects a function index in the current build (also works with analyze).

Limits are inclusive integer bytes. Exit: 0 success, 1 policy failed, 2 input/error.
Build the MoonBit core first: npm run build`;

try {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage);
  } else if(args.length===1 && ['--version','-v'].includes(args[0])){
    console.log(version);
  } else {
    const command = args.shift();
    if (!['analyze','diff','record'].includes(command)) throw new Error('Expected analyze, diff or record. Use --help.');
    const inputs = [];
    const options = new Map();
    while (args.length) {
      const arg = args.shift();
      if (!arg.startsWith('--')) { inputs.push(arg); continue; }
      if (!['--json','--json-file','--html','--max-bytes','--max-growth','--why','--compress','--policy','--summary','--before-build','--after-build','--build-info','--output'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
      if (options.has(arg)) throw new Error(`Duplicate option: ${arg}`);
      if (arg === '--json' || arg === '--compress') { options.set(arg, true); continue; }
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options.set(arg, value);
    }
    if (inputs.length !== (command === 'diff' ? 2 : 1)) throw new Error(`Incorrect number of input files for ${command}`);
    const permitted=command==='record' ? ['--build-info','--output'] : command==='analyze' ? ['--json','--json-file','--html','--why','--compress','--summary','--after-build'] : ['--json','--json-file','--html','--why','--compress','--summary','--before-build','--after-build','--max-bytes','--max-growth','--policy'];
    for(const key of options.keys())if(!permitted.includes(key))throw new Error(`${key} is not supported by ${command}`);
    if(command==='record' && (!options.has('--build-info') || !options.has('--output')))throw new Error('record requires --build-info and --output');
    const hasBudget = options.has('--max-bytes') || options.has('--max-growth');
    if (hasBudget && command !== 'diff') throw new Error('Budget options require diff with a baseline.');
    const limit = name => {
      if (!options.has(name)) return -1;
      const value = options.get(name);
      if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 2147483647) throw new Error(`${name} must be an integer from 0 to 2147483647`);
      return Number(value);
    };
    const maxBytes = limit('--max-bytes'), maxGrowth = limit('--max-growth');
    const why = limit('--why');
    const {analyze_json,budget_json,compare_json,limits_json}=await import('../_build/js/release/build/moonsize.js');
    const {readBounded,readConfig,parsePolicy,createBuildRecord,verifyBuildRecord,compareBuilds,measureSizes,evaluatePolicy,protectOutputs}=await import('../lib/engineering.mjs');
    const limits=JSON.parse(limits_json());
    const configInputs=['--policy','--before-build','--after-build','--build-info'].filter(key=>options.has(key)).map(key=>options.get(key));
    const outputs=['--json-file','--html','--summary','--output'].filter(key=>options.has(key)).map(key=>options.get(key));
    await protectOutputs(outputs,[...inputs,...configInputs]);
    jsonOutput=options.has('--json-file')?path.resolve(options.get('--json-file')):null;
    const policy=parsePolicy(options.has('--policy') ? await readConfig(options.get('--policy')) : undefined);
    for(const [key,value] of [['max_bytes',maxBytes],['max_growth_bytes',maxGrowth]])if(value!==-1){
      policy.budgets.raw ??= {};
      if(Object.hasOwn(policy.budgets.raw,key))throw new Error(`Duplicate raw budget ${key} in CLI and policy`);
      policy.budgets.raw[key]=value;
    }
    const data = await Promise.all(inputs.map(file=>readBounded(file,limits.max_input_bytes)));
    const result = JSON.parse(command !== 'diff' ? analyze_json(data[0]) : hasBudget ? budget_json(data[0],data[1],maxBytes,maxGrowth) : compare_json(data[0],data[1]));
    if (!result.ok) {
      await writeJsonFile(result);
      if (options.has('--json')) console.log(JSON.stringify(result, null, 2));
      else console.error(`MoonSize: byte ${result.error.offset}: ${result.error.message}`);
      process.exitCode = 2;
    } else if(command==='record') {
      const record=createBuildRecord(data[0],await readConfig(options.get('--build-info')));
      const output=path.resolve(options.get('--output'));
      await mkdir(path.dirname(output),{recursive:true});
      await writeFile(output,JSON.stringify(record,null,2)+'\n');
      console.log(`Build record: ${output}`);
    } else {
      const provenance={before:null,after:null};
      for(const [side,index] of [['before',0],['after',data.length-1]])if(options.has(`--${side}-build`))provenance[side]=verifyBuildRecord(await readConfig(options.get(`--${side}-build`)),data[index]);
      provenance.comparability=compareBuilds(provenance.before,provenance.after);
      const compressed=options.has('--compress')||Object.hasOwn(policy.budgets,'gzip')||Object.hasOwn(policy.budgets,'brotli');
      const delivery=await measureSizes(command==='diff'?data[0]:null,data.at(-1),compressed);
      const decision=evaluatePolicy(policy,delivery,provenance.comparability);
      result.engineering={schema_version:1,policy,provenance,delivery,decision};
      const rawCheck=decision.checks.find(check=>check.metric==='raw');
      if(rawCheck){const {metric,...budget}=rawCheck;result.budget=budget;}
      const current = result.analysis ?? result.after;
      if (why !== -1) {
        if (!current.references.nodes[why]) throw new Error('Function index unavailable or out of range in current build');
        result.explanation={function_index:why,...referencePath(current.references,why)};
      }
      const files = command === 'analyze' ? {input: inputs[0]} : {before: inputs[0], after: inputs[1]};
      await writeJsonFile(result);
      if (options.has('--html')) {
        const output = path.resolve(options.get('--html'));
        await mkdir(path.dirname(output), {recursive:true});
        await writeFile(output, renderReport(result,files));
        console.error(`Report: ${output}`);
      }
      if(options.has('--summary')){
        const output=path.resolve(options.get('--summary'));
        await mkdir(path.dirname(output),{recursive:true});
        await appendFile(output,renderSummary(result,files));
        console.error(`Summary: ${output}`);
      }
      if (options.has('--json')) console.log(JSON.stringify(result,null,2));
      else {
        const a = result.analysis ?? result.after;
        console.log(`MoonSize  ${inputs.at(-1)}\n${bytes(a.total_bytes)} · ${a.sections.length} sections · ${a.functions.length} defined functions`);
        if (result.comparison) console.log(`Change: ${signed(result.comparison.delta_bytes)} (baseline ${bytes(result.comparison.before_bytes)})`);
        console.log(`Reported build conditions: ${provenance.comparability.status}`);
        for(const row of provenance.comparability.differences)console.log(`  Different: ${row.field}`);
        if(provenance.comparability.missing.length)console.log(`  Unknown: ${provenance.comparability.missing.map(row=>row.field).join(', ')}`);
        for(const metric of ['gzip','brotli'])if(delivery.metrics[metric]){
          const m=delivery.metrics[metric];
          console.log(`${metric}: ${m.before_bytes===null?'':`${bytes(m.before_bytes)} → `}${bytes(m.after_bytes)}${m.delta_bytes===null?'':` (${signed(m.delta_bytes)})`}`);
        }
        if(delivery.compression)console.log(`Whole-file compression: ${JSON.stringify(delivery.compression)}`);
        const rows = result.comparison?.sections ?? a.sections;
        for (const s of rows) console.log(`  ${s.id === 0 ? `custom:${s.custom_name}` : s.label}  ${result.comparison ? `${bytes(s.before_bytes)} → ${bytes(s.after_bytes)} (${signed(s.delta_bytes)})` : bytes(s.total_bytes)}`);
        const safe=value=>String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
        const d=result.comparison;
        if(d?.matching){
          console.log('Function matching: unique raw symbols only (not behavioral equivalence)');
          for(const side of ['before','after']){
            const c=d.matching[side],pct=(n,total)=>total?`${(100*n/total).toFixed(1)}%`:'n/a';
            console.log(`  ${side}: ${c.matched_functions}/${c.total_functions} functions (${pct(c.matched_functions,c.total_functions)}), ${bytes(c.matched_bytes)}/${bytes(c.total_bytes)} body bytes (${pct(c.matched_bytes,c.total_bytes)})`);
            console.log(`    missing names ${c.missing_name}, ambiguous ${c.ambiguous_name}, symbols only here ${c.symbol_only_here}`);
          }
          console.log('Largest package changes (symbol-owned bodies, already included in code):');
          for(const p of d.packages.toSorted((a,b)=>Math.abs(b.delta_bytes)-Math.abs(a.delta_bytes)).slice(0,10))console.log(`  ${signed(p.delta_bytes)}  ${safe(p.package_name??'[unknown ownership]')}`);
          console.log(`Code framing change: ${signed(d.code_overhead_delta_bytes)}`);
          console.log('Largest function changes (one-sided symbols can reflect renaming/inlining/stripping):');
          for(const row of d.functions.filter(r=>r.delta_bytes!==null&&r.delta_bytes!==0).toSorted((a,b)=>Math.abs(b.delta_bytes)-Math.abs(a.delta_bytes)).slice(0,10)){
            const f=row.after??row.before;
            console.log(`  ${row.change}  ${signed(row.delta_bytes)}  ${safe(f.symbol?.display??f.name)} (${row.reason})`);
          }
        }
        for (const w of result.before?.warnings ?? []) console.error(`Before warning: ${w}`);
        for (const w of a.warnings) console.error(`Warning: ${w}`);
        if (a.functions.length) {
          console.log('Largest defined function bodies (already included in code):');
          for (const f of a.functions.toSorted((x,y)=>y.total_bytes-x.total_bytes||x.ordinal-y.ordinal).slice(0,10)) {
            const name = f.symbol?.display ?? f.name ?? `code[${f.ordinal}]`;
            const safeName = name.replace(/[\u0000-\u001f\u007f-\u009f]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
            console.log(`  ${bytes(f.total_bytes)}  ${safeName}`);
          }
        }
        const graph=a.references;
        console.log(`References: ${graph.status} · ${graph.decoded_functions}/${graph.total_functions} decoded bodies · ${graph.edges.length} known references · ${graph.dynamic_references.length} unresolved dynamic calls`);
        console.log('Known reference paths do not prove execution or removable size. No known path does not mean unused.');
        for(const issue of graph.issues.slice(0,5))console.error(`Reference issue: ${issue.source_kind}[${issue.source_index}] byte ${issue.offset}: ${safe(issue.message)}`);
        if(result.before?.references.issues.length)console.error(`Baseline reference issues: ${result.before.references.issues.length} (see JSON for evidence)`);
        if(result.explanation){
          const names=new Map(a.functions.map(f=>[f.function_index,f.symbol?.display??f.name]));
          const name=i=>safe(names.get(i)??graph.nodes[i]?.name??`func[${i}]`);
          const explanation=result.explanation,node=graph.nodes[why];
          console.log(`Why ${name(why)} (#${why}, ${node.scan_status}):`);
          if(explanation.root){
            console.log(`  ${explanation.root.kind} ${safe(explanation.root.name)} → ${name(explanation.root.function_index)}`);
            for(const edge of explanation.edges)console.log(`    → ${name(edge.target)} (${edge.kind}, byte ${edge.offset})`);
          }else console.log('  No known inclusion path. This does not prove the function is unused.');
          for(const [title,ids,incoming] of [['Direct callers',node.incoming,true],['Direct callees',node.outgoing,false],['Other incoming references',node.incoming,true],['Function references taken here',node.outgoing,false]]){
            const direct=title.startsWith('Direct');
            const edges=ids.map(i=>graph.edges[i]).filter(e=>((e.kind==='call'||e.kind==='return_call')&&e.source_kind==='function')===direct);
            console.log(`  ${title} (${edges.length}):`);
            for(const e of edges.slice(0,50))console.log(`    ${incoming?(e.source_kind==='function'?name(e.source_index):`${e.source_kind}[${e.source_index}]`):name(e.target)} (${e.kind}, byte ${e.offset})`);
          }
          for(const ref of graph.dynamic_references.filter(r=>r.source_kind==='function'&&r.source_index===why).slice(0,50))console.log(`  Unresolved ${ref.kind} at byte ${ref.offset}, type[${ref.type_index}]${ref.table_index===null?'':`, table[${ref.table_index}]`}`);
        }
        if (result.budget) console.log(`Raw budget: ${result.budget.passed ? 'PASS' : 'FAIL'}${result.budget.violations.length ? '\n'+result.budget.violations.join('\n') : ''}`);
      }
      if(!options.has('--json')){
        console.log(`Policy: ${decision.status}`);
        for(const violation of decision.violations)console.log(`  ${violation.scope}: ${violation.message}`);
      }
      if (decision.status==='fail') process.exitCode = 1;
    }
  }
} catch (error) {
  const response={ok:false,error:{code:'invalid_input',offset:0,message:error.message}};
  if(jsonOutput){
    try{await writeJsonFile(response);}
    catch(writeError){console.error(`MoonSize: could not write JSON error: ${writeError.message}`);}
  }
  if(process.argv.includes('--json'))console.log(JSON.stringify(response,null,2));
  else console.error(`MoonSize: ${error.message}`);
  process.exitCode = 2;
}
