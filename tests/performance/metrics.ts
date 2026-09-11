import type {Page, CDPSession} from '@playwright/test';

export const profiles = [
  {name: '4g-half-cpu', cpuRate: 2, latency: 40, downloadThroughput: 4_000_000 / 8, uploadThroughput: 3_000_000 / 8, connectionType: 'cellular4g' as const, readyBudgetMs: 15_000, exportBudgetMs: 90_000},
  {name: '3g-half-cpu', cpuRate: 2, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, connectionType: 'cellular3g' as const, readyBudgetMs: 30_000, exportBudgetMs: 180_000},
];
export type Profile = typeof profiles[number];

export async function throttle(page: Page, profile: Profile) {
  const cdp = await page.context().newCDPSession(page);
  const conditions = {offline: false, latency: profile.latency, downloadThroughput: profile.downloadThroughput, uploadThroughput: profile.uploadThroughput, connectionType: profile.connectionType};
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
  const {ruleIds}=await cdp.send('Network.emulateNetworkConditionsByRule', {offline:false,matchedNetworkConditions:[{urlPattern:'',...conditions}]});
  await cdp.send('Network.overrideNetworkState', conditions);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: profile.cpuRate});
  await cdp.send('Performance.enable');
  // Pause workers until their Network observer is attached. Chromium reports
  // renderer request URLs on worker sessions but throttle-rule evidence on the
  // parent session; join them by request ID. No delayed mock responses.
  let id = 0;
  const pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: Error) => void}>();
  const workers: {url: string; networkApplied: boolean; requests: number; throttledRequests: number; error?: string}[] = [];
  const sessions=new Map<string,typeof workers[number]>();
  const networkRequests=new Map<string,{url?:string;ruleId?:string;workerUrl?:string}>();
  const observe=(method:string,params:any,workerUrl?:string)=>{
   if(!['Network.requestWillBeSent','Network.requestWillBeSentExtraInfo'].includes(method))return;
   const row=networkRequests.get(params.requestId)??{};
   if(params.request)row.url=params.request.url;
   if(params.appliedNetworkConditionsId)row.ruleId=params.appliedNetworkConditionsId;
   if(workerUrl)row.workerUrl=workerUrl;
   networkRequests.set(params.requestId,row);
  };
  cdp.on('Network.requestWillBeSent',p=>observe('Network.requestWillBeSent',p));
  cdp.on('Network.requestWillBeSentExtraInfo',p=>observe('Network.requestWillBeSentExtraInfo',p));
  const send = (sessionId: string, method: string, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id; pending.set(commandId, {resolve, reject});
    cdp.send('Target.sendMessageToTarget', {sessionId, message: JSON.stringify({id: commandId, method, params})}).catch(reject);
  });
  cdp.on('Target.receivedMessageFromTarget', ({message,sessionId}) => {
    const result = JSON.parse(message), callback = pending.get(result.id);
    const worker=sessions.get(sessionId);
    if(result.method)observe(result.method,result.params,worker?.url);
    if (!callback) return;
    pending.delete(result.id);
    if (result.error) callback.reject(new Error(result.error.message)); else callback.resolve(result.result);
  });
  cdp.on('Target.attachedToTarget', async ({sessionId, targetInfo}) => {
    const record = {url: targetInfo.url, networkApplied: false, requests:0,throttledRequests:0,error: undefined as string | undefined}; workers.push(record);sessions.set(sessionId,record);
    try {
      await send(sessionId, 'Network.enable');
      // Network throttling is inherited from the page's global rule.
      // Assert its rule ID on actual worker requests instead of assuming it.
    } catch (error) {record.error = String(error);}
    finally {await send(sessionId, 'Runtime.runIfWaitingForDebugger').catch(() => {});}
  });
  await cdp.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true, flatten: false, filter: [{type: 'worker'}, {type: 'shared_worker'}, {exclude: true}]});
  const networkEvidence=()=>workers.map(worker=>{
   const records=[...networkRequests.values()].filter(r=>r.workerUrl===worker.url&&/\/emoji-delivery\/(32|64|128|256)\//.test(r.url??''));
   const throttled=records.filter(r=>r.ruleId&&ruleIds.includes(r.ruleId));
   return {...worker,requests:records.length,throttledRequests:throttled.length,networkApplied:records.length>0&&throttled.length===records.length};
  });
  return {cdp, networkEvidence};
}

export async function installMetrics(page: Page) {
  await page.addInitScript(() => {
    const state = {phase: 'load', started: performance.now(), gaps: [] as number[], longTasks: [] as number[], paints: {} as Record<string, number>, lcp: 0, layoutShiftSum: 0, lastFrame: 0, script: '', copiedAt: 0};
    (window as any).__perf = state;
    new PerformanceObserver(list => {for (const entry of list.getEntries()) if(entry.startTime>=state.started)state.longTasks.push(entry.duration);}).observe({type: 'longtask', buffered: true});
    new PerformanceObserver(list => {for (const entry of list.getEntries()) state.paints[entry.name] = entry.startTime;}).observe({type: 'paint', buffered: true});
    new PerformanceObserver(list => {for (const entry of list.getEntries()) state.lcp = entry.startTime;}).observe({type: 'largest-contentful-paint', buffered: true});
    new PerformanceObserver(list => {for (const entry of list.getEntries() as any) if (!entry.hadRecentInput) state.layoutShiftSum += entry.value;}).observe({type: 'layout-shift', buffered: true});
    const frame = (now: number) => {if (state.lastFrame) state.gaps.push(now-state.lastFrame); state.lastFrame=now; requestAnimationFrame(frame);};requestAnimationFrame(frame);
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async text => {await write(text);state.script=text;state.copiedAt=performance.now();};
  });
}
export async function begin(page: Page, phase: string) {
  await page.evaluate(phase => {const s=(window as any).__perf;s.phase=phase;s.gaps=[];s.longTasks=[];s.lastFrame=0;s.started=performance.now();}, phase);
}
export async function snapshot(page: Page) {
  return page.evaluate(() => {
    const s=(window as any).__perf, gaps=[...s.gaps].sort((a:number,b:number)=>a-b);
    return {phase:s.phase,durationMs:performance.now()-s.started,frames:gaps.length,p95FrameGapMs:gaps[Math.floor(gaps.length*.95)]??0,maxFrameGapMs:Math.max(0,...gaps),longTaskCount:s.longTasks.length,maxLongTaskMs:Math.max(0,...s.longTasks),blockingMs:s.longTasks.reduce((n:number,d:number)=>n+Math.max(0,d-50),0),fcpMs:s.paints['first-contentful-paint'],lcpMs:s.lcp,layoutShiftSum:s.layoutShiftSum};
  });
}
export async function cpuMetrics(cdp: CDPSession) {
  const {metrics} = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.filter(r=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','JSHeapUsedSize','Nodes'].includes(r.name)).map(r=>[r.name,r.value]));
}
