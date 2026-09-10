import {it,expect,vi,afterEach} from 'vitest';
import {loadSlackImages} from './slackDelivery';
afterEach(()=>vi.unstubAllGlobals());
it('selects the requested size and preserves image bytes',async()=>{
 const bytes=new Uint8Array([0,255,128,42]);const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:{test:{variants:{256:{webp:{path:'/emoji-delivery/256/test.webp',bytes:4}}}}}})}).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>bytes.buffer});vi.stubGlobal('fetch',fetch);
 const images=await loadSlackImages(['test.webp'],256,()=>{});
 expect(fetch.mock.calls[1][0]).toContain('/256/test.webp');expect(images[0]).toEqual({filename:'test.webp',mimeType:'image/webp',base64:'AP+AKg=='});
});
it('preserves large animations rather than treating the recommended size as a hard limit',async()=>{
 const bytes=new Uint8Array(128001);
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:{test:{variants:{128:{webp:{path:'/large.webp',bytes:bytes.length}}}}}})}).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>bytes.buffer});vi.stubGlobal('fetch',fetch);
 const images=await loadSlackImages(['test.webp'],128,()=>{});
 expect(images[0].mimeType).toBe('image/webp');expect(atob(images[0].base64).length).toBe(bytes.length);expect(fetch).toHaveBeenCalledTimes(2);
});
