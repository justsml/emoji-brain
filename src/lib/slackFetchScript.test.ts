import {it, expect, vi} from 'vitest';
import vm from 'node:vm';
import {webcrypto, createHash} from 'node:crypto';
import {Blob, File} from 'node:buffer';
import JSZip from 'jszip';
class UploadForm { fields=new Map(); append(k:string,v:unknown){this.fields.set(k,v)} get(k:string){return this.fields.get(k)} }
import {generateFetchingSlackBrowserScript} from './slackBrowserScript';
const bytes = Buffer.from('verified emoji');
const descriptor = {filename:'test.webp',mimeType:'image/webp',url:'https://assets.example/test.webp',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
function environment(fetch: ReturnType<typeof vi.fn>, archive?: Uint8Array) {
 const input: any = {files:archive ? [new File([archive], 'emoji.zip')] : [], click(){this.onchange()}};
 return {Blob, File, URL, Response, Uint8Array, DataView, TextDecoder, AbortController, AbortSignal, crypto:webcrypto, atob, btoa, FormData:UploadForm,
  location:{hostname:'test.slack.com'},document:{querySelector:()=>({value:'slack-secret'}),createElement:()=>input},
  console:{log(){},error(){},table(){}},setTimeout:(cb:()=>void)=>setTimeout(cb,0),fetch};
}
it('fetches public data without credentials and uploads only verified bytes to Slack',async()=>{
 const fetch=vi.fn(async(url:string, _options?: any)=>url.startsWith('https:')?new Response(bytes):new Response('{"ok":true}'));
 const result=await vm.runInNewContext(generateFetchingSlackBrowserScript([descriptor]),environment(fetch));
 expect(result[0].status).toBe('uploaded');
 expect(fetch.mock.calls[0][1]).toMatchObject({credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
 expect(JSON.stringify(fetch.mock.calls[0])).not.toContain('slack-secret');
 expect(fetch.mock.calls[1][0]).toBe('/api/emoji.add');
 const body=fetch.mock.calls[1][1].body as FormData;
 expect(body.get('token')).toBe('slack-secret');
 expect(Buffer.from(await (body.get('image') as File).arrayBuffer())).toEqual(bytes);
});
for(const mode of ['hash','size','missing','csp'])it(`never enters replacement or deletion on ${mode} failure`,async()=>{
 const fetch=vi.fn(async()=>{if(mode==='csp')throw Error('blocked by CSP');return mode==='missing'?new Response('',{status:404}):new Response(mode==='size'?Buffer.concat([bytes,bytes]):bytes)});
 const image={...descriptor,...(mode==='hash'?{sha256:'0'.repeat(64)}:{})};
 await expect(vm.runInNewContext(generateFetchingSlackBrowserScript([image],{overwrite:true}),environment(fetch))).rejects.toThrow(mode==='hash'?'SHA-256':mode==='size'?'byte count':'import-local.js');
 expect(fetch.mock.calls.every(([url])=>String(url).startsWith('https://assets.example/'))).toBe(true);
});
it('uses the original STORE ZIP without any external requests',async()=>{
 const zip=new JSZip();zip.file('root-original.webp',bytes);zip.file('slack/images/test.webp',bytes);
 const archive=await zip.generateAsync({type:'uint8array',compression:'STORE'});
 const fetch=vi.fn(async()=>new Response('{"ok":true}'));
 const result=await vm.runInNewContext(generateFetchingSlackBrowserScript([descriptor],{},'zip'),environment(fetch,archive));
 expect(result[0].status).toBe('uploaded');expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/emoji.add']);
});
it('rejects a missing ZIP image without uploading',async()=>{
 const archive=await new JSZip().generateAsync({type:'uint8array'}), fetch=vi.fn();
 await expect(vm.runInNewContext(generateFetchingSlackBrowserScript([descriptor],{},'zip'),environment(fetch,archive))).rejects.toThrow('Missing slack/images');
 expect(fetch).not.toHaveBeenCalled();
});
it('honors cancellation before any upload',async()=>{
 let context: any;
 const fetch=vi.fn(async()=>{context.cancelSlackEmojiUpload();return new Response(bytes)});
 context=vm.createContext(environment(fetch));
 await expect(vm.runInContext(generateFetchingSlackBrowserScript([descriptor]),context)).rejects.toThrow();
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('retries explicit rate limits but never retries an ambiguous upload failure',async()=>{
 let uploads=0;
 const fetch=vi.fn(async(url:string, _options?: any)=>url.startsWith('https:')?new Response(bytes):++uploads===1?new Response('',{status:429}):new Response('{"ok":true}'));
 expect((await vm.runInNewContext(generateFetchingSlackBrowserScript([descriptor]),environment(fetch)))[0].status).toBe('uploaded');
 expect(uploads).toBe(2);
 const failure=vi.fn(async(url:string, _options?: any)=>{if(url.startsWith('https:'))return new Response(bytes);throw Error('network disconnected')});
 expect((await vm.runInNewContext(generateFetchingSlackBrowserScript([descriptor]),environment(failure)))[0].status).toBe('error');
 expect(failure).toHaveBeenCalledTimes(2);
});

it('records the full catalog fetch script size with pinned production descriptors',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {planSlackExport}=await import('./slackExportPlan');
 const {items}=JSON.parse(await readFile('public/emoji-delivery/manifest.json','utf8'));
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Blob',Blob);
 try {
  const rows=Object.entries(items).map(([name,row])=>({filename:name+'.webp',row:row as any}));
  const result=await planSlackExport(rows,async assets=>Promise.all(assets.map(a=>readFile('public'+a.path))),()=>{},{fetchOrigin:'https://adorbs.fun'});
  process.stdout.write('FULL CATALOG FETCH: '+JSON.stringify({count:rows.length,scriptBytes:result.scriptBytes,resolutions:result.resolutions})+'\n');
  expect(result.scriptBytes).toBeLessThan(150_000);
  expect(result.script).not.toContain('"base64":');
 }finally{vi.unstubAllGlobals()}
});
