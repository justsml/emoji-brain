// One lazy loader owns the browser engine. Pagefind uses its own shared worker.
let loading: Promise<any> | undefined;
export function getPagefind(): Promise<any> {
  if(window.pagefind)return Promise.resolve(window.pagefind);
  if(!loading){
    const path='/pagefind/pagefind.js';
    loading=import(/* @vite-ignore */ path).then(async client=>{
      await client.options({excerptLength:0});
      await client.init();
      // One small ID facet replaces hundreds of individual result fragments.
      await client.filters();
      window.pagefind=client;
      return client;
    }).catch(error=>{loading=undefined;throw error;});
  }
  return loading;
}
export function warmPagefind() { void getPagefind().catch(()=>{}); }
