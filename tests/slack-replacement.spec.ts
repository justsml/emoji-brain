import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs/promises';

for(const scenario of ['replace','restore','changed','alias','delete-rejected','lost-acknowledgement','restore-failure'] as const)test(`optional Slack replacement: ${scenario}`,async({page,context})=>{
  test.setTimeout(60_000);
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).copiedEmojiScript=text;}}}));
  await page.goto('/');const first=page.locator('[role="gridcell"] button').first();
  const filename=(await first.getAttribute('aria-label'))!.split(',')[0],name=filename.replace(/\.webp$/,'').toLowerCase();
  await first.click();await page.getByRole('button',{name:'Other export options'}).click();
  await page.getByRole('menuitem',{name:'Slack script: replace smaller…'}).click();
  await expect(page.getByLabel('Close Slack instructions')).toBeVisible();
  const script=await page.evaluate(()=>(window as any).copiedEmojiScript);
  const old=await sharp({create:{width:16,height:16,channels:4,background:'#1268ae'}}).webp({lossless:true}).toBuffer();
  const newer=await fs.readFile('public/emoji-delivery/256/'+filename);
  const mock=await context.newPage();await mock.route('https://emoji-replace-test.slack.com/**',route=>route.fulfill({contentType:'text/html',body:'<input name="token" value="fixture-token">'}));
  await mock.goto('https://emoji-replace-test.slack.com/customize/emoji');mock.on('dialog',dialog=>dialog.accept());
  await mock.evaluate(({name,old,scenario})=>{
    const state:any={name,bytes:old,url:'https://emoji-cdn.test/original.webp',exists:true,requests:[],failed:false};(window as any).replacementFixture=state;
    window.fetch=async(url,init)=>{
      const path=String(url);
      if(path.startsWith('https://emoji-cdn.test/'))return new Response(new Uint8Array(state.bytes),{headers:{'Content-Type':'image/webp'}});
      const form=init!.body as FormData;state.requests.push({path,method:init!.method,name:form.get('name'),reason:form.get('_x_reason'),mode:form.get('_x_mode')});
      if(path==='/api/emoji.adminList'){
        let rows=state.exists?[{name,url:state.url}]:[];
        if(scenario==='alias'&&!form.has('queries'))rows.push({name:'dependent_alias',url:'alias:'+name});
        return Response.json({ok:true,emoji:rows,paging:{page:1,pages:1,total:rows.length}});
      }
      if(path==='/api/emoji.remove'){if(scenario==='delete-rejected')return Response.json({ok:false,error:'no_permission'});state.exists=false;return scenario==='lost-acknowledgement'?new Response('lost-response'):Response.json({ok:true});}
      if(path==='/api/emoji.add'){
        if(scenario==='restore-failure'||(scenario==='restore'&&!state.failed)){state.failed=true;return Response.json({ok:false,error:'fixture-upload-failure'});}
        state.exists=true;state.url='https://emoji-cdn.test/uploaded.webp';state.bytes=Array.from(new Uint8Array(await (form.get('image') as File).arrayBuffer()));return Response.json({ok:true});
      }
      throw Error('Unexpected fixture request '+path);
    };
  },{name,old:Array.from(old),scenario});
  await mock.evaluate(script);
  await expect(mock.getByRole('status')).toContainText('Nothing has been uploaded or deleted');
  expect(await mock.evaluate(()=>(window as any).replacementFixture.requests.filter((r:any)=>r.path!=='/api/emoji.adminList'))).toEqual([]);
  if(scenario==='alias'){
    await expect(mock.getByLabel('Include '+name)).toBeDisabled();
    await expect(mock.locator('table')).toContainText('Existing aliases depend');await mock.close();return;
  }
  await expect(mock.getByRole('button',{name:'Apply selected replacements and uploads'})).toBeDisabled();
  const pendingDownload=mock.waitForEvent('download');await mock.getByRole('button',{name:'Download originals backup'}).click();
  const download=await pendingDownload,backup=JSON.parse(await fs.readFile((await download.path())!,'utf8'));
  expect(backup.originals).toHaveLength(1);expect(Buffer.from(backup.originals[0].base64,'base64')).toEqual(old);expect(JSON.stringify(backup)).not.toContain('fixture-token');
  if(scenario==='changed')await mock.evaluate(bytes=>{(window as any).replacementFixture.bytes=bytes;},Array.from(newer));
  await mock.getByLabel('I saved the originals backup').check();await mock.getByRole('button',{name:'Apply selected replacements and uploads'}).click();
  await expect.poll(()=>mock.evaluate(()=>(window as any).slackEmojiReplacementReport.status),{timeout:40_000}).toMatch(/^(complete|stopped-error)$/);
  const result=await mock.evaluate(()=>({report:(window as any).slackEmojiReplacementReport,state:(window as any).replacementFixture}));
  const removes=result.state.requests.filter((r:any)=>r.path==='/api/emoji.remove');
  if(scenario==='changed'){expect(removes).toHaveLength(0);expect(result.report.items[0].status).toBe('skipped-changed');}
  else {
    expect(removes).toEqual([{path:'/api/emoji.remove',method:'POST',name,reason:'customize-emoji-remove',mode:'online'}]);
    const expected=scenario==='restore'?'restored-original':scenario==='restore-failure'?'restore-failed':scenario==='delete-rejected'?'stopped':'replaced';
    expect(result.report.items[0].status).toBe(expected);
    expect(Buffer.from(result.state.bytes)).toEqual(['replace','lost-acknowledgement'].includes(scenario)?newer:old);
    if(scenario==='delete-rejected')expect(result.state.requests.filter((r:any)=>r.path==='/api/emoji.add')).toHaveLength(0);
    if(scenario==='restore-failure')expect(result.report.status).toBe('stopped-error');
  }
  await mock.close();
});
