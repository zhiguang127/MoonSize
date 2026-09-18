#!/usr/bin/env node
import { open, writeFile, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { analyze_json, budget_json, compare_json, limits_json } from '../_build/js/release/build/moonsize.js';
import { bytes, signed, renderReport } from '../ui/report.mjs';
import {referencePath} from '../ui/reference-view.mjs';
const limits = JSON.parse(limits_json());

const usage = `MoonSize — inspect WebAssembly build sizes

  node bin/moonsize.mjs analyze file.wasm [--json] [--html report.html]
  node bin/moonsize.mjs diff before.wasm after.wasm [--json] [--html report.html]
      [--max-bytes N] [--max-growth N] [--why FUNCTION_INDEX]

--why inspects a function index in the current build (also works with analyze).

Limits are inclusive integer bytes. Exit: 0 success, 1 budget exceeded, 2 input/error.
Build the MoonBit core first: npm run build`;

try {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage);
  } else {
    const command = args.shift();
    if (!['analyze','diff'].includes(command)) throw new Error('Expected analyze or diff. Use --help.');
    const inputs = [];
    const options = new Map();
    while (args.length) {
      const arg = args.shift();
      if (!arg.startsWith('--')) { inputs.push(arg); continue; }
      if (!['--json','--html','--max-bytes','--max-growth','--why'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
      if (options.has(arg)) throw new Error(`Duplicate option: ${arg}`);
      if (arg === '--json') { options.set(arg, true); continue; }
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options.set(arg, value);
    }
    if (inputs.length !== (command === 'diff' ? 2 : 1)) throw new Error(`Incorrect number of input files for ${command}`);
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
    const data = await Promise.all(inputs.map(async file => {
      const handle = await open(file,'r');
      try {
        const size = (await handle.stat()).size;
        if (size > limits.max_input_bytes) throw new Error(`Input exceeds limit ${limits.max_input_bytes} bytes`);
        if (!Number.isSafeInteger(size) || size < 0) throw new Error('Unsupported file size');
        const data = new Uint8Array(size);
        let offset = 0;
        while (offset < size) {
          const {bytesRead} = await handle.read(data,offset,size-offset,offset);
          if (!bytesRead) throw new Error('Input changed while reading');
          offset += bytesRead;
        }
        if ((await handle.stat()).size !== size) throw new Error('Input changed while reading');
        return data;
      } finally { await handle.close(); }
    }));
    const result = JSON.parse(command === 'analyze' ? analyze_json(data[0]) : hasBudget ? budget_json(data[0],data[1],maxBytes,maxGrowth) : compare_json(data[0],data[1]));
    if (!result.ok) {
      if (options.has('--json')) console.log(JSON.stringify(result, null, 2));
      else console.error(`MoonSize: byte ${result.error.offset}: ${result.error.message}`);
      process.exitCode = 2;
    } else {
      const current = result.analysis ?? result.after;
      if (why !== -1) {
        if (!current.references.nodes[why]) throw new Error('Function index unavailable or out of range in current build');
        result.explanation={function_index:why,...referencePath(current.references,why)};
      }
      const files = command === 'analyze' ? {input: inputs[0]} : {before: inputs[0], after: inputs[1]};
      if (options.has('--html')) {
        const output = path.resolve(options.get('--html'));
        const canonical = await realpath(output).catch(() => output);
        for (const input of inputs) {
          if (canonical.toLowerCase() === (await realpath(input)).toLowerCase()) throw new Error('HTML output must not overwrite an input module');
        }
        await mkdir(path.dirname(output), {recursive:true});
        await writeFile(output, renderReport(result,files));
        console.error(`Report: ${output}`);
      }
      if (options.has('--json')) console.log(JSON.stringify(result,null,2));
      else {
        const a = result.analysis ?? result.after;
        console.log(`MoonSize  ${inputs.at(-1)}\n${bytes(a.total_bytes)} · ${a.sections.length} sections · ${a.functions.length} defined functions`);
        if (result.comparison) console.log(`Change: ${signed(result.comparison.delta_bytes)} (baseline ${bytes(result.comparison.before_bytes)})`);
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
        if (result.budget) console.log(`Budget: ${result.budget.passed ? 'PASS' : 'FAIL'}${result.budget.violations.length ? '\n'+result.budget.violations.join('\n') : ''}`);
      }
      if (result.budget && !result.budget.passed) process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(`MoonSize: ${error.message}`);
  process.exitCode = 2;
}
