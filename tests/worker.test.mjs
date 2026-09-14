import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {AnalysisClient} from '../ui/analysis-client.mjs';
import {analyze_json,limits_json} from '../_build/js/release/build/moonsize.js';
const empty=Uint8Array.from([0,97,115,109,1,0,0,0]);

test('real worker uses core limits, transfers input and returns identical analysis',async()=>{
  const worker=new Worker(new URL('../ui/analyzer.worker.mjs',import.meta.url));
  try{
    const [ready]=await once(worker,'message');
    assert.equal(ready.type,'ready');assert.deepEqual(ready.limits,JSON.parse(limits_json()));
    const input=empty.slice().buffer;
    const response=once(worker,'message');
    worker.postMessage({id:1,before:null,after:input},[input]);
    assert.equal(input.byteLength,0);
    const [message]=await response;
    assert.deepEqual(message.result,JSON.parse(analyze_json(empty)));
    const invalid=once(worker,'message');
    worker.postMessage({id:2,before:null,after:new ArrayBuffer(1),maxBytes:1.5});
    assert.equal((await invalid)[0].result.ok,false);
  }finally{await worker.terminate();}
});

class FakeWorker {
  terminate(){this.terminated=true;}
  postMessage(value){this.sent=value;}
  emit(data){this.onmessage({data});}
}
test('cancel terminates pending work and discards late results',async()=>{
  const worker=new FakeWorker(),client=new AnalysisClient({workerFactory:()=>worker});
  worker.emit({type:'ready',limits:{}});await client.ready;
  const pending=client.run(null,empty.slice().buffer,-1,-1);
  const rejected=assert.rejects(pending,{name:'AbortError'});
  client.cancel();worker.emit({type:'result',id:1,result:{ok:true}});
  await rejected;assert.equal(worker.terminated,true);assert.equal(client.closed,true);
});

test('cancel aborts a request submitted to a real worker and waits for termination',async()=>{
  const worker=new Worker(new URL('../ui/analyzer.worker.mjs',import.meta.url));
  let termination;
  const adapter={postMessage:(message,transfer)=>worker.postMessage(message,transfer),terminate:()=>{termination=worker.terminate();}};
  worker.on('message',data=>adapter.onmessage?.({data}));
  worker.on('error',error=>adapter.onerror?.(error));
  const client=new AnalysisClient({workerFactory:()=>adapter});
  try {
    await client.ready;
    const pending=client.run(null,empty.slice().buffer,-1,-1);
    const rejected=assert.rejects(pending,{name:'AbortError'});
    client.cancel();await rejected;await termination;
    assert.equal(client.closed,true);
  }finally{client.close();await worker.terminate();}
});
test('worker startup timeout rejects and releases the worker',async()=>{
  const worker=new FakeWorker();
  const client=new AnalysisClient({timeoutMs:10,workerFactory:()=>worker});
  await assert.rejects(client.ready,{name:'AbortError'});
  assert.equal(worker.terminated,true);
});
test('worker startup errors release resources',async()=>{
  const worker=new FakeWorker(),client=new AnalysisClient({workerFactory:()=>worker});
  const rejected=assert.rejects(client.ready,{name:'AbortError'});
  worker.onerror({preventDefault(){}});await rejected;
  assert.equal(worker.terminated,true);
});
test('oversize core inputs fail at entry with a machine readable resource error',()=>{
  const limits=JSON.parse(limits_json());
  const data=new Uint8Array(limits.max_input_bytes+1);
  const result=JSON.parse(analyze_json(data));
  assert.equal(result.ok,false);assert.equal(result.error.code,'resource_limit');
});
