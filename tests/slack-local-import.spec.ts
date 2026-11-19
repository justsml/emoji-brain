import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import JSZip from 'jszip';

test('exported ZIP importer reads the selected archive and uploads without external requests', async ({page,context}) => {
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('[role="gridcell"] > button').first().click();
  await page.getByRole('button',{name:'Other export options'}).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button',{name:/Originals.*full-size ZIP/}).click();
  const download = await pending;
  const archive = await fs.readFile((await download.path())!);
  const zip = await JSZip.loadAsync(archive);
  const script = await zip.file('slack/import-local.js')!.async('string');
  const image = Object.keys(zip.files).find(name=>name.startsWith('slack/images/') && name.endsWith('.webp'))!;
  const bytes = await zip.file(image)!.async('nodebuffer');
  const mock = await context.newPage();
  await mock.route('https://emoji-zip-test.slack.com/**', route=>route.fulfill({contentType:'text/html',body:'<input name="token" value="fixture-token">'}));
  await mock.goto('https://emoji-zip-test.slack.com/customize/emoji');
  await mock.evaluate(()=>{
    (window as any).uploadRequests=[];
    window.fetch=async(url,init)=>{
      if(String(url)!=='/api/emoji.add')throw Error('Unexpected external image request: '+url);
      const form=init!.body as FormData;
      (window as any).uploadRequests.push({token:form.get('token'),bytes:Array.from(new Uint8Array(await (form.get('image') as File).arrayBuffer()))});
      return Response.json({ok:true});
    };
  });
  const chooser = mock.waitForEvent('filechooser');
  const running = mock.evaluate(script);
  await (await chooser).setFiles({name:'emoji.zip',mimeType:'application/zip',buffer:archive});
  await running;
  const uploads = await mock.evaluate(()=>(window as any).uploadRequests);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].token).toBe('fixture-token');
  expect(Buffer.from(uploads[0].bytes)).toEqual(bytes);
  await mock.close();
});
