import {it,expect,vi,afterEach} from 'vitest';
import JSZip from 'jszip';
import {Blob} from 'node:buffer';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareExport} from './exportCore';
import {markdownTable} from './emojiAssets';
afterEach(()=>vi.unstubAllGlobals());
it('ZIP packages the full-resolution WebP bytes, not a resized variant',async()=>{
 const data=new Uint8Array([82,73,70,70,1,2,3]);
 vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
 const fetch=vi.fn(async(url:URL)=>String(url).endsWith('manifest.json')?{ok:true,json:async()=>({items:{test:{animated:false,original:{path:'/original/test.webp',bytes:data.length},variants:{256:{webp:{path:'/256/test.webp',bytes:data.length}}}}}})}:{ok:true,arrayBuffer:async()=>data.buffer});vi.stubGlobal('fetch',fetch);
 const result=await prepareExport({kind:'zip',filenames:['test.webp'],origin:'https://example.test'},()=>{});
 expect(String(fetch.mock.calls[1][0])).toBe('https://example.test/original/test.webp');
 if(result.kind!=='zip')throw Error('Wrong result');
 const zip=await JSZip.loadAsync(result.buffer);
 expect(await zip.file('test.webp')!.async('uint8array')).toEqual(data);
 expect(await zip.file('slack/images/test.webp')!.async('uint8array')).toEqual(data);
 const directory=await mkdtemp(join(tmpdir(),'emoji-slack-generator-'));
 try {
  for(const [name,file] of Object.entries(zip.files))if(!file.dir){const path=join(directory,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,await file.async('nodebuffer'));}
  execFileSync('sh',['generate-slack-script.sh'],{cwd:directory});
  const generated=await readFile(join(directory,'slack-upload.js'),'utf8');
  expect(generated).toContain(Buffer.from(data).toString('base64'));
  expect(generated).toContain('/api/emoji.add');
  expect(Buffer.byteLength(generated)).toBeLessThan(8_000_000);
 } finally {await rm(directory,{recursive:true,force:true});}

});
it('rejects missing or stale files instead of silently creating a damaged archive',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:{test:{original:{path:'/test.webp',bytes:5}}}})}).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)}));
 await expect(prepareExport({kind:'zip',filenames:['test.webp'],origin:'https://example.test'},()=>{})).rejects.toThrow('Stale optimized asset');
});
it('Markdown links the full-size image and three actual sized WebP previews',()=>{
 const text=markdownTable(['roo-sip.webp'],'https://example.test');
 expect(text).toContain('[roo-sip](https://example.test/emoji-delivery/original/roo-sip.webp)');
 for(const size of [64,128,256])expect(text).toContain(`![roo-sip ${size}px](https://example.test/emoji-delivery/${size}/roo-sip.webp)`);
 expect(text.split('\n')).toHaveLength(3);
});
