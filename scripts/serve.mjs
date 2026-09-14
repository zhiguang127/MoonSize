// Small local preview server. Only known UI/build/demo files are exposed.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT??4173);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
const routes = new Map([
  ['/','ui/index.html'],['/ui/','ui/index.html'],['/ui/index.html','ui/index.html'],
  ['/app.mjs','ui/app.mjs'],['/report.mjs','ui/report.mjs'],
  ['/ui/app.mjs','ui/app.mjs'],['/ui/report.mjs','ui/report.mjs'],
  ['/ui/analysis-client.mjs','ui/analysis-client.mjs'],['/ui/analyzer.worker.mjs','ui/analyzer.worker.mjs'],
  ['/analysis-client.mjs','ui/analysis-client.mjs'],['/analyzer.worker.mjs','ui/analyzer.worker.mjs'],
  ['/_build/js/release/build/moonsize.js','_build/js/release/build/moonsize.js'],
  ['/reports/demo/before.wasm','reports/demo/before.wasm'],['/reports/demo/after.wasm','reports/demo/after.wasm'],
  ['/reports/demo/report.html','reports/demo/report.html'],
  ['/reports/cases/cmark-before.wasm','reports/cases/cmark-before.wasm'],['/reports/cases/cmark-after.wasm','reports/cases/cmark-after.wasm'],
  ['/reports/cases/cmark-report.html','reports/cases/cmark-report.html'],['/reports/cases/toml-report.html','reports/cases/toml-report.html'],
]);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const name=routes.get(new URL(req.url,'http://localhost').pathname);
  if(!name){res.writeHead(404);res.end('Not found');return;}
  try {
    const data=await readFile(path.join(root,name));
    res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  } catch {res.writeHead(404);res.end('Missing build or demo file. Run npm run demo first.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`MoonSize playground: http://127.0.0.1:${port}/ui/`));
