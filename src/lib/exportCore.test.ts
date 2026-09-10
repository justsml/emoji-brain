import {it,expect,vi,afterEach} from 'vitest';
import JSZip from 'jszip';
import {prepareExport} from './exportCore';
import {markdownTable} from './emojiAssets';
afterEach(()=>vi.unstubAllGlobals());
it('ZIP packages the full-resolution WebP bytes, not a resized variant',async()=>{
 const data=new Uint8Array([82,73,70,70,1,2,3]);
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:{test:{original:{path:'/original/test.webp',bytes:data.length},variants:{128:{webp:{path:'/128/test.webp',bytes:1}}}}}})}).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>data.buffer});vi.stubGlobal('fetch',fetch);
 const result=await prepareExport({kind:'zip',filenames:['test.webp'],origin:'https://example.test'},()=>{});
 expect(String(fetch.mock.calls[1][0])).toBe('https://example.test/original/test.webp');
 if(result.kind!=='zip')throw Error('Wrong result');
 const zip=await JSZip.loadAsync(result.buffer);expect(Object.keys(zip.files)).toEqual(['test.webp']);expect(await zip.file('test.webp')!.async('uint8array')).toEqual(data);
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
