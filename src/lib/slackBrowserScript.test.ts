import {describe,it,expect,vi,afterEach} from 'vitest';
import vm from 'node:vm';
import {Blob,File} from 'node:buffer';
import {CompressionStream,DecompressionStream} from 'node:stream/web';
afterEach(()=>vi.unstubAllGlobals());
import {generateCompactSlackBrowserScript,generateSlackBrowserScript} from './slackBrowserScript';
describe('compressed console uploader',()=>{
 it('round trips image bytes and metadata through gzip without external code',async()=>{
  vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',CompressionStream);
  const bytes=Buffer.from('transparent emoji frame data '.repeat(300));
  const images=[{filename:'roo-test.webp',mimeType:'image/webp',base64:bytes.toString('base64')}];
  const script=await generateCompactSlackBrowserScript(images);
  expect(script).toContain('DecompressionStream');expect(script.length).toBeLessThan(generateSlackBrowserScript(images).length);expect(script).not.toContain('eval(');
  let uploaded:File|undefined;
  class UploadForm {fields=new Map();append(k:string,v:unknown){this.fields.set(k,v)}get(k:string){return this.fields.get(k)}}
  const context={Blob,Response,DecompressionStream,Uint8Array,atob,File,FormData:UploadForm,location:{hostname:'test.slack.com'},document:{querySelector:()=>({value:'test-token'})},console:{log(){},error(){},table(){}},setTimeout,fetch:async(_url:string,options:{body:FormData})=>{uploaded=options.body.get('image') as File;return {ok:true,json:async()=>({ok:true})}}};
  const report=await vm.runInNewContext(script,context);
  expect(report[0].status).toBe('uploaded');expect(uploaded?.name).toBe('roo-test.webp');expect(uploaded?.type).toBe('image/webp');expect(Buffer.from(await uploaded!.arrayBuffer())).toEqual(bytes);
 });
});
