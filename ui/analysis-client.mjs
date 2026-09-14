export class AnalysisClient {
  constructor({timeoutMs=30000,workerFactory=()=>new Worker(new URL('./analyzer.worker.mjs',import.meta.url),{type:'module'})}={}) {
    this.worker=workerFactory();this.closed=false;
    this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
    this.timer=setTimeout(()=>this.cancel('分析超时，请缩小输入文件或使用 CLI。'),timeoutMs);
    this.worker.onmessage=event=>{
      if(this.closed)return;
      if(event.data?.type==='ready')this.resolveReady(event.data.limits);
      else if(event.data?.type==='result'&&event.data.id===1&&this.resolveResult){this.resolveResult(event.data.result);this.close();}
    };
    this.worker.onerror=event=>{event.preventDefault?.();this.cancel('分析 Worker 启动或运行失败，请确认已构建项目。');};
    this.worker.onmessageerror=()=>this.cancel('无法读取分析 Worker 的结果。');
  }
  run(before,after,maxBytes,maxGrowth) {
    if(this.closed||this.resolveResult)return Promise.reject(new Error('Analysis client is closed or already used'));
    return new Promise((resolve,reject)=>{
      this.resolveResult=resolve;this.rejectResult=reject;
      try{this.worker.postMessage({id:1,before,after,maxBytes,maxGrowth},before?[before,after]:[after]);}
      catch(error){reject(error);this.close();}
    });
  }
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);this.worker.terminate();}
  cancel(message='分析已取消。'){
    if(this.closed)return;
    const error=new Error(message);error.name='AbortError';
    this.rejectReady(error);this.rejectResult?.(error);this.close();
  }
}
