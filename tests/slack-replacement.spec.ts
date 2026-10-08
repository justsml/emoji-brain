import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs/promises';

for(const scenario of ['replace','restore','changed','alias','delete-rejected','lost-acknowledgement','restore-failure','overwrite','overwrite-denied','overwrite-identical','overwrite-restore','overwrite-cancel','overwrite-next-upload'] as const)test(`optional Slack replacement: ${scenario}`,async({page,context})=>{
  test.setTimeout(60_000);
  const overwrite = scenario.startsWith('overwrite');
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).copiedEmojiScript=text;}}}));
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const first=page.locator('[role="gridcell"] > button').first();
  const filename=(await first.getAttribute('aria-label'))!.split(',')[0],name=filename.replace(/\.webp$/,'').toLowerCase();
  await first.click();
  let nextName='';
  if(scenario==='overwrite-next-upload'){const next=page.locator('[role="gridcell"] > button').nth(1);nextName=(await next.getAttribute('aria-label'))!.split(',')[0].replace(/\.webp$/,'').toLowerCase();await next.click();}
  await page.getByRole('button',{name:'Other export options'}).click();
  if(overwrite){
    await expect(page.getByRole('checkbox',{name:'Overwrite existing Slack emojis'})).not.toBeChecked();
    await page.getByRole('checkbox',{name:'Overwrite existing Slack emojis'}).check();
    await expect(page.locator('.export-overwrite')).toContainText('Requires deletion permission');
  }
  await page.getByRole('menuitem',{name:overwrite?'Slack script':'Slack script: replace smaller…',exact:true}).click();
  await expect(page.getByLabel('Close Slack instructions')).toBeVisible();
  const script=await page.evaluate(()=>(window as any).copiedEmojiScript);
  const newer=await fs.readFile('public/emoji-delivery/256/'+filename);
  const old=scenario==='overwrite-identical'?newer:await sharp({create:{width:overwrite?512:16,height:overwrite?512:16,channels:4,background:'#1268ae'}}).webp({lossless:true}).toBuffer();
  const mock=await context.newPage();await mock.route('https://emoji-replace-test.slack.com/**',route=>route.fulfill({contentType:'text/html',body:'<input name="token" value="fixture-token">'}));
  await mock.goto('https://emoji-replace-test.slack.com/customize/emoji');mock.on('dialog',dialog=>scenario==='overwrite-cancel'?dialog.dismiss():dialog.accept());
  await mock.evaluate(({name,old,scenario,nextName})=>{
    const state:any={name,bytes:old,url:'https://emoji-cdn.test/original.webp',exists:true,requests:[],failed:false,nextName,nextExists:false,nextBytes:[]};(window as any).replacementFixture=state;
    window.fetch=async(url,init)=>{
      const path=String(url);
      if(path==='https://emoji-cdn.test/next.webp')return new Response(new Uint8Array(state.nextBytes),{headers:{'Content-Type':'image/webp'}});
      if(path.startsWith('https://emoji-cdn.test/'))return new Response(new Uint8Array(state.bytes),{headers:{'Content-Type':'image/webp'}});
      const form=init!.body as FormData;state.requests.push({path,method:init!.method,name:form.get('name'),reason:form.get('_x_reason'),mode:form.get('_x_mode')});
      if(path==='/api/emoji.adminList'){
        let rows=state.exists?[{name,url:state.url}]:[];
        if(scenario==='alias'&&!form.has('queries'))rows.push({name:'dependent_alias',url:'alias:'+name});
        if(state.nextExists)rows.push({name:state.nextName,url:'https://emoji-cdn.test/next.webp'});
        if(form.has('queries')){const query=JSON.parse(String(form.get('queries')))[0];rows=rows.filter((row:any)=>row.name===query);}
        return Response.json({ok:true,emoji:rows,paging:{page:1,pages:1,total:rows.length}});
      }
      if(path==='/api/emoji.remove'){if(['delete-rejected','overwrite-denied','overwrite-next-upload'].includes(scenario))return Response.json({ok:false,error:'no_permission'});state.exists=false;return scenario==='lost-acknowledgement'?new Response('lost-response'):Response.json({ok:true});}
      if(path==='/api/emoji.add'){
        if(form.get('name')===state.nextName){state.nextExists=true;state.nextBytes=Array.from(new Uint8Array(await (form.get('image') as File).arrayBuffer()));return Response.json({ok:true});}
        if(scenario==='restore-failure'||(['restore','overwrite-restore'].includes(scenario)&&!state.failed)){state.failed=true;return Response.json({ok:false,error:'fixture-upload-failure'});}
        state.exists=true;state.url='https://emoji-cdn.test/uploaded.webp';state.bytes=Array.from(new Uint8Array(await (form.get('image') as File).arrayBuffer()));return Response.json({ok:true});
      }
      throw Error('Unexpected fixture request '+path);
    };
  },{name,old:Array.from(old),scenario,nextName});
  await mock.evaluate(script);
  await expect(mock.getByRole('status')).toContainText('Nothing has been uploaded or deleted');
  expect(await mock.evaluate(()=>(window as any).replacementFixture.requests.filter((r:any)=>r.path!=='/api/emoji.adminList'))).toEqual([]);
  if(scenario==='overwrite-identical'){await expect(mock.getByLabel('Include '+name)).toBeDisabled();await expect(mock.locator('table')).toContainText('Already identical');await mock.close();return;}
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
  if(scenario==='overwrite-cancel'){expect(await mock.evaluate(()=>(window as any).replacementFixture.requests.some((r:any)=>r.path==='/api/emoji.remove'||r.path==='/api/emoji.add'))).toBe(false);await expect(mock.getByRole('status')).toContainText('Save the backup');await mock.close();return;}
  await expect.poll(()=>mock.evaluate(()=>(window as any).slackEmojiReplacementReport.status),{timeout:40_000}).toMatch(/^(complete|stopped-error)$/);
  const result=await mock.evaluate(()=>({report:(window as any).slackEmojiReplacementReport,state:(window as any).replacementFixture}));
  if(scenario==='overwrite-next-upload'){expect(result.report.items.map((item:any)=>item.status)).toEqual(['skipped-permission','uploaded']);expect(result.state.nextExists).toBe(true);expect(result.state.requests.filter((r:any)=>r.path==='/api/emoji.add').map((r:any)=>r.name)).toEqual([nextName]);expect(Buffer.from(result.state.bytes)).toEqual(old);await mock.close();return;}
  const removes=result.state.requests.filter((r:any)=>r.path==='/api/emoji.remove');
  if(scenario==='changed'){expect(removes).toHaveLength(0);expect(result.report.items[0].status).toBe('skipped-changed');}
  else {
    expect(removes).toEqual([{path:'/api/emoji.remove',method:'POST',name,reason:'customize-emoji-remove',mode:'online'}]);
    const expected=['restore','overwrite-restore'].includes(scenario)?'restored-original':scenario==='restore-failure'?'restore-failed':scenario==='overwrite-denied'?'skipped-permission':scenario==='delete-rejected'?'stopped':'replaced';
    expect(result.report.items[0].status).toBe(expected);
    expect(Buffer.from(result.state.bytes)).toEqual(['replace','lost-acknowledgement','overwrite'].includes(scenario)?newer:old);
    if(['delete-rejected','overwrite-denied'].includes(scenario))expect(result.state.requests.filter((r:any)=>r.path==='/api/emoji.add')).toHaveLength(0);
    if(scenario==='restore-failure')expect(result.report.status).toBe('stopped-error');
  }
  await mock.close();
});
