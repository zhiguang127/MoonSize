import {analyze_json,compare_json,budget_json,limits_json} from '../_build/js/release/build/moonsize.js';
// Browser and Node tests use the same analysis worker and MoonBit core.
let send, listen;
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  send = value => self.postMessage(value);
  listen = callback => { self.onmessage = event => callback(event.data); };
} else {
  const {parentPort} = await import('node:worker_threads');
  send = value => parentPort.postMessage(value);
  listen = callback => parentPort.on('message',callback);
}
const limits = JSON.parse(limits_json());
listen(message => {
  const {id,before,after,maxBytes=-1,maxGrowth=-1} = message ?? {};
  try {
    if (!(after instanceof ArrayBuffer) || (before !== null && !(before instanceof ArrayBuffer))) throw new Error('Expected ArrayBuffer inputs');
    if (after.byteLength > limits.max_input_bytes || (before && before.byteLength > limits.max_input_bytes)) throw new Error(`Each input is limited to ${limits.max_input_bytes} bytes`);
    for (const value of [maxBytes,maxGrowth]) if (!Number.isInteger(value) || value < -1 || value > 2147483647) throw new Error('Invalid budget');
    if (!before && (maxBytes !== -1 || maxGrowth !== -1)) throw new Error('Budget checks require a baseline');
    const a = new Uint8Array(after), b = before ? new Uint8Array(before) : null;
    const text = b ? maxBytes !== -1 || maxGrowth !== -1 ? budget_json(b,a,maxBytes,maxGrowth) : compare_json(b,a) : analyze_json(a);
    send({type:'result',id,result:JSON.parse(text)});
  } catch (error) {
    send({type:'result',id,result:{ok:false,error:{code:'worker_input',offset:0,message:error.message}}});
  }
});
send({type:'ready',limits});
