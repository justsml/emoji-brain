import {describe,it,expect,vi,afterEach} from 'vitest';
import vm from 'node:vm';
import {randomBytes} from 'node:crypto';
import {Blob,File} from 'node:buffer';
import {CompressionStream,DecompressionStream} from 'node:stream/web';
afterEach(()=>vi.unstubAllGlobals());
import {generateCompactSlackBrowserScript,generateSlackBrowserScript} from './slackBrowserScript';
describe('compressed console uploader',()=>{
 it('round trips image bytes and metadata through gzip without external code',async()=>{
  vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',CompressionStream);
  const bytes=Buffer.from(randomBytes(120_000).toString('hex'));
  const images=[{filename:'roo-test.webp',mimeType:'image/webp',base64:bytes.toString('base64')}];
  const script=await generateCompactSlackBrowserScript(images);
  expect(script).toContain('DecompressionStream');expect(script.length).toBeLessThan(generateSlackBrowserScript(images).length);expect(script).not.toContain('eval(');
  let uploaded:File|undefined;
  class UploadForm {fields=new Map();append(k:string,v:unknown){this.fields.set(k,v)}get(k:string){return this.fields.get(k)}}
  const yieldTask=vi.fn((callback: () => void)=>setTimeout(callback,0));
  const context={Blob,Response,DecompressionStream,Uint8Array,atob,File,FormData:UploadForm,location:{hostname:'test.slack.com'},document:{querySelector:()=>({value:'test-token'})},console:{log(){},error(){},table(){}},setTimeout:yieldTask,fetch:async(_url:string,options:{body:FormData})=>{uploaded=options.body.get('image') as File;return {ok:true,json:async()=>({ok:true})}}};
  const report=await vm.runInNewContext(script,context);
  expect(yieldTask.mock.calls.length).toBeGreaterThan(3);
  expect(report[0].status).toBe('uploaded');expect(uploaded?.name).toBe('roo-test.webp');expect(uploaded?.type).toBe('image/webp');expect(Buffer.from(await uploaded!.arrayBuffer())).toEqual(bytes);
 }, 15_000);

 describe('finding the Slack token',()=>{
  const image=[{filename:'Roo Test.webp',mimeType:'image/webp',base64:Buffer.from('abc').toString('base64')}];
  class UploadForm {fields=new Map();append(k:string,v:unknown){this.fields.set(k,v)}get(k:string){return this.fields.get(k)}}
  async function run(env:{hostname?:string;localStorage?:Record<string,string>;boot?:Record<string,unknown>;input?:string}){
   const tokens:unknown[]=[];
   const context:Record<string,unknown>={Blob,Response,Uint8Array,atob,File,URL,FormData:UploadForm,console:{log(){},error(){},table(){}},setTimeout:(cb:()=>void)=>setTimeout(cb,0),
    location:{hostname:env.hostname??'acme.slack.com'},
    document:{querySelector:()=>env.input?{value:env.input}:null},
    localStorage:{getItem:(key:string)=>env.localStorage?.[key]??null},
    fetch:async(_url:string,options:{body:UploadForm})=>{tokens.push(options.body.get('token'));return {ok:true,json:async()=>({ok:true})}},
    ...(env.boot??{})};
   const outcome=await vm.runInNewContext(generateSlackBrowserScript(image),context).then((report:unknown)=>({report}),(error:Error)=>({error:error.message}));
   return {tokens,...outcome};
  }
  const config=(teams:Record<string,object>)=>({localConfig_v2:JSON.stringify({teams})});
  it('still prefers the page fields it always read',async()=>{
   expect((await run({input:'page-token',localStorage:config({T1:{url:'https://acme.slack.com/',token:'session-token'}})})).tokens).toEqual(['page-token']);
  });
  it('reads the session token of the workspace being visited',async()=>{
   const result=await run({localStorage:config({T1:{url:'https://other.slack.com/',token:'other-token'},T2:{url:'https://acme.slack.com/',token:'acme-token'}})});
   expect(result.tokens).toEqual(['acme-token']);
  });
  it('matches on the workspace domain when the record has no url',async()=>{
   expect((await run({localStorage:config({T1:{domain:'acme',token:'domain-token'},T2:{domain:'other',token:'x'}})})).tokens).toEqual(['domain-token']);
  });
  it('takes the only workspace on record, but never guesses between several',async()=>{
   expect((await run({localStorage:config({T1:{url:'https://elsewhere.slack.com/',token:'lone-token'}})})).tokens).toEqual(['lone-token']);
   const ambiguous=await run({localStorage:config({T1:{url:'https://a.slack.com/',token:'a'},T2:{url:'https://b.slack.com/',token:'b'}})});
   expect(ambiguous.tokens).toEqual([]);
   expect(ambiguous.error).toContain('SLACK_TOKEN');
  });
  it('honours an explicit override and survives unreadable storage',async()=>{
   expect((await run({boot:{SLACK_TOKEN:'typed-token'},localStorage:{localConfig_v2:'not json'}})).tokens).toEqual(['typed-token']);
   const broken=await run({localStorage:{localConfig_v2:'not json'}});
   expect(broken.error).toContain('Could not find the Slack token');
  });
 });
});
