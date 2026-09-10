import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';

test('console export uses both optimized WebP sizes and uploads identical bytes in a mocked browser',async({page,context})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).copiedEmojiScript=text;}}}));
  await page.goto('/');
  await page.locator('div[role="gridcell"] button').first().click();
  await expect(page.getByLabel('Slack image size')).toHaveValue('128');
  for(const size of [128,256]){
    await page.getByLabel('Slack image size').selectOption(String(size));
    const assetResponse=page.waitForResponse(r=>r.url().includes(`/emoji-delivery/${size}/`)&&r.url().endsWith('.webp'));
    await page.getByRole('button',{name:'Copy Slack script',exact:true}).click();
    const asset=await assetResponse,expected=await asset.body();
    await expect(page.getByLabel('Close Slack instructions')).toBeVisible();
    const script=await page.evaluate(()=>(window as any).copiedEmojiScript);
    const mock=await context.newPage();
    await mock.route('https://emoji-export-test.slack.com/**',route=>route.fulfill({contentType:'text/html',body:'<input name="token" value="fixture-token">'}));
    await mock.goto('https://emoji-export-test.slack.com/customize/emoji');
    await mock.evaluate(()=>{
      window.fetch=async(_url,init)=>{
        const file=(init!.body as FormData).get('image') as File;
        (window as any).uploadedEmoji={name:file.name,type:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))};
        return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
      };
    });
    await mock.evaluate(script);
    const uploaded=await mock.evaluate(()=>(window as any).uploadedEmoji);
    expect(uploaded.type).toBe('image/webp');expect(uploaded.name).toMatch(/\.webp$/);
    expect(createHash('sha256').update(Buffer.from(uploaded.bytes)).digest('hex')).toBe(createHash('sha256').update(expected).digest('hex'));
    await mock.close();
    await page.getByLabel('Close Slack instructions').click();
  }
});

test('delivery comparison decodes both sizes and preserves the requested deep link',async({page})=>{
  await page.goto('/emoji-delivery/index.html#bizcat');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.getByLabel('Emoji',{exact:true})).toHaveValue('bizcat');
  expect(await page.locator('#images img').evaluateAll(imgs=>imgs.map(i=>({width:(i as HTMLImageElement).naturalWidth,height:(i as HTMLImageElement).naturalHeight})))).toEqual([{width:128,height:128},{width:256,height:256}]);
  await expect(page.getByRole('link',{name:'Download WebP',exact:true})).toHaveCount(2);
});
