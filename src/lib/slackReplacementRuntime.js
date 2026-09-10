// Embedded as source in an opt-in console script. Keep this function self-contained.
async function runSlackEmojiReplacement(images, token, decide) {
  if (document.getElementById('emoji-replacement-panel')) throw Error('A replacement preview is already open.');
  const panel = document.createElement('section'); panel.id = 'emoji-replacement-panel';
  Object.assign(panel.style, {position:'fixed',inset:'24px',zIndex:'2147483647',background:'#fff',color:'#17202a',padding:'24px',overflow:'auto',font:'14px/1.5 system-ui',border:'2px solid #34495e',borderRadius:'12px',boxShadow:'0 12px 60px #0006'});
  const previews=[];
  const styles=document.createElement('style');styles.textContent='#emoji-replacement-panel td,#emoji-replacement-panel th{padding:8px;border-bottom:1px solid #d5dce3}#emoji-replacement-panel button{font:inherit;padding:7px 12px;margin:8px;cursor:pointer}#emoji-replacement-panel img{display:block;object-fit:contain;background:repeating-conic-gradient(#eee 0% 25%,#fff 0% 50%) 0/12px 12px}';panel.append(styles);
  const title=document.createElement('h2');title.textContent='Preview smaller emoji replacements';panel.append(title);
  const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
  const stop=document.createElement('button');stop.textContent='Stop / close';panel.append(stop);document.body.append(panel);
  let stopped=false,busy=false,nextRequest=0,backupSaved=false;
  const report={status:'scanning',items:[]};globalThis.slackEmojiReplacementReport=report;
  stop.onclick=()=>{stopped=true;if(!busy){panel.remove();previews.forEach(url=>URL.revokeObjectURL(url));}else status.textContent='Stopping after the current operation…';};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const update=text=>{status.textContent=text;console.log('[emoji-replacement]',text);};
  const normalize=name=>name.replace(/\.[^.]+$/,'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/_+/g,'_').replace(/^[_-]+|[_-]+$/g,'');
  const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
  const base64=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
  const incomingBlob=image=>new Blob([Uint8Array.from(atob(image.base64),c=>c.charCodeAt(0))],{type:image.mimeType});
  async function request(path,fields) {
    for(let attempt=0;attempt<4;attempt++) {
      await sleep(Math.max(0,nextRequest-Date.now()));nextRequest=Date.now()+1100;
      const form=new FormData();form.set('token',token);for(const [key,value]of Object.entries(fields))form.set(key,value);
      const response=await fetch(path,{method:'POST',credentials:'same-origin',body:form,signal:AbortSignal.timeout(20000)});
      if(response.status===429){const retry=response.headers.get('retry-after');const wait=retry&&Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry||'')-Date.now());nextRequest=Date.now()+Math.max(Number.isFinite(wait)?wait:0,2000*2**attempt);continue;}
      const body=await response.json();
      if(!response.ok||body.ok!==true)throw Error(path+': '+(body.error||'Unconfirmed response (HTTP '+response.status+')'));
      return body;
    }
    throw Error(path+': rate limit retries exhausted');
  }
  async function list(name) {
    const rows=new Map();let total;
    for(let page=1;page<=10000;page++) {
      if(stopped&&report.status==='scanning')throw Error('Stopped');
      const fields={page:String(page),count:'100',_x_reason:'customize-emoji-new-query',_x_mode:'online'};
      if(name){fields.queries=JSON.stringify([name]);fields.user_ids='[]';}
      const body=await request('/api/emoji.adminList',fields),p=body.paging;
      if(!Array.isArray(body.emoji)||!p||!Number.isInteger(p.pages)||!Number.isInteger(p.total)||p.pages<0||p.total<0)throw Error('Cannot verify emoji list pagination');
      if(total!==undefined&&total!==p.total)throw Error('Workspace changed during inspection; scan again');total=p.total;
      const previous=rows.size;
      for(const row of body.emoji){if(typeof row.name!=='string'||rows.has(row.name))throw Error('Invalid or duplicate name in emoji list');rows.set(row.name,row);}
      if(page>=p.pages){if(rows.size!==total)throw Error('Incomplete emoji list');return [...rows.values()];}
      if(rows.size===previous)throw Error('Emoji listing made no progress');
    }
    throw Error('Too many emoji pages');
  }
  const alias=row=>row.alias_for||(typeof row.url==='string'&&row.url.startsWith('alias:')?row.url.slice(6):undefined);
  async function measure(blob) {
    const bitmap=await createImageBitmap(blob),width=bitmap.width,height=bitmap.height;bitmap.close();
    const bytes=new Uint8Array(await blob.arrayBuffer());let animated;
    const ascii=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
    if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'){
      animated=false;const view=new DataView(bytes.buffer);for(let p=12;p+8<=bytes.length;){const size=view.getUint32(p+4,true);if(ascii(p,p+4)==='ANIM')animated=true;p+=8+size+(size%2);}
    }else if(globalThis.ImageDecoder&&await ImageDecoder.isTypeSupported(blob.type)){
      const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:blob.type});try{await decoder.tracks.ready;animated=decoder.tracks.selectedTrack.frameCount>1;}finally{decoder.close();}
    }
    return {width,height,animated};
  }
  async function readExisting(row) {
    if(alias(row))throw Error('Aliases cannot be replaced');
    const url=new URL(row.url);if(url.protocol!=='https:')throw Error('Invalid existing image URL');
    const response=await fetch(url.href,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Cannot back up existing image');
    const blob=await response.blob();if(!blob.size)throw Error('Empty existing image');
    return {row,blob,hash:await digest(blob),meta:{name:row.name,...await measure(blob)}};
  }
  const lookup=async name=>(await list(name)).find(row=>row.name===name);
  async function add(name,blob) {
    const extension=blob.type==='image/webp'?'webp':blob.type==='image/gif'?'gif':'png';
    return request('/api/emoji.add',{name,mode:'data',image:new File([blob],name+'.'+extension,{type:blob.type}),_x_reason:'customize-emoji-add',_x_mode:'online'});
  }
  const same=async(row,blob)=>row&&!alias(row)&&(await readExisting(row)).hash===await digest(blob);
  try {
    busy=true;update('Reading workspace emoji names and aliases…');const existing=await list();
    const backups=new Map(),incoming=new Map(),metadata=[];
    for(const image of images){if(stopped)throw Error('Stopped');const name=normalize(image.filename),blob=incomingBlob(image);incoming.set(name,blob);metadata.push({name,...await measure(blob)});await sleep(0);}
    const existingMetadata=[];const names=new Set(metadata.map(r=>r.name));
    for(const row of existing){
      if(stopped)throw Error('Stopped');
      if(alias(row)){existingMetadata.push({name:row.name,aliasFor:alias(row)});continue;}
      if(!names.has(row.name))continue;
      update('Inspecting '+row.name+'…');
      try{const value=await readExisting(row);backups.set(row.name,value);existingMetadata.push(value.meta);}
      catch{existingMetadata.push({name:row.name});}
    }
    const decisions=decide(metadata,existingMetadata);globalThis.slackEmojiReplacementPlan=decisions.map(row=>({...row}));
    const table=document.createElement('table');Object.assign(table.style,{width:'100%',textAlign:'left',borderCollapse:'collapse'});panel.append(table);
    const headings=table.createTHead().insertRow();for(const label of ['Include','Emoji','Current','Incoming','Decision']){const th=document.createElement('th');th.scope='col';th.textContent=label;headings.append(th);}
    const rows=table.createTBody();
    const thumbnail=(cell,blob,description)=>{if(!blob)return;const img=document.createElement('img'),url=URL.createObjectURL(blob);previews.push(url);img.src=url;img.alt=description;img.width=48;img.height=48;img.loading='lazy';img.decoding='async';cell.append(img);};
    const selected=new Set();const checks=[];
    for(const decision of decisions){const row=rows.insertRow(),cell=row.insertCell(),check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Include '+decision.name);check.disabled=!['replace-smaller','upload-new'].includes(decision.action);check.checked=!check.disabled;if(check.checked)selected.add(decision.name);cell.append(check);checks.push(check);
      for(const text of [decision.name,decision.current?.width?decision.current.width+'×'+decision.current.height:'—',decision.incoming.width+'×'+decision.incoming.height,decision.action+' · '+decision.reason])row.insertCell().textContent=text;
      thumbnail(row.cells[2],backups.get(decision.name)?.blob,'Current '+decision.name);thumbnail(row.cells[3],incoming.get(decision.name),'Incoming '+decision.name);
      check.onchange=()=>{if(check.checked)selected.add(decision.name);else selected.delete(decision.name);backupSaved=false;saved.checked=false;apply.disabled=true;};}
    const download=document.createElement('button');download.textContent='Download originals backup';panel.append(download);
    const label=document.createElement('label'),saved=document.createElement('input');saved.type='checkbox';saved.disabled=true;label.append(saved,document.createTextNode(' I saved the originals backup'));panel.append(label);
    const apply=document.createElement('button');apply.textContent='Apply selected replacements and uploads';apply.disabled=true;panel.append(apply);
    saved.onchange=()=>{apply.disabled=!saved.checked||!backupSaved;};
    download.onclick=async()=>{
      const backupSelection=JSON.stringify([...selected].sort());
      try{const originals=[];for(const d of decisions)if(selected.has(d.name)&&d.action==='replace-smaller'){const b=backups.get(d.name);originals.push({name:d.name,mimeType:b.blob.type,sha256:b.hash,...b.meta,base64:await base64(b.blob)});}
      const blob=new Blob([JSON.stringify({format:'slack-emoji-replacement-backup-v1',workspace:location.hostname,createdAt:new Date().toISOString(),originals},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='slack-emoji-originals-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);backupSaved=backupSelection===JSON.stringify([...selected].sort());saved.disabled=!backupSaved;update('Save the backup, then check the confirmation box.');}catch(error){update('Backup failed: '+error.message);}
    };
    apply.onclick=async()=>{
      if(busy||!backupSaved||!saved.checked||!selected.size)return;
      const replacements=decisions.filter(d=>selected.has(d.name)&&d.action==='replace-smaller');
      if(!confirm('Replace '+replacements.length+' smaller emojis and upload selected new names? The old images will be deleted one at a time.'))return;
      busy=true;apply.disabled=true;download.disabled=true;saved.disabled=true;checks.forEach(check=>check.disabled=true);stop.textContent='Stop after current emoji';report.status='applying';
      try {
        const fresh=await list();const dependents=new Set(fresh.map(alias).filter(Boolean));
        for(const d of decisions){if(stopped)break;if(!selected.has(d.name))continue;update('Processing '+d.name+'…');
          const blob=incoming.get(d.name),before=await lookup(d.name);
          if(d.action==='upload-new'){if(before){report.items.push({name:d.name,status:'skipped-changed'});continue;}await add(d.name,blob);if(!await same(await lookup(d.name),blob))throw Error('Could not verify uploaded '+d.name);report.items.push({name:d.name,status:'uploaded'});continue;}
          const backup=backups.get(d.name);
          if(!before||alias(before)||dependents.has(d.name)||!await same(before,backup.blob)){report.items.push({name:d.name,status:'skipped-changed'});continue;}
          try {
            try{await request('/api/emoji.remove',{name:d.name,_x_reason:'customize-emoji-remove',_x_mode:'online'});}catch(error){if(await lookup(d.name))throw error;}
            if(await lookup(d.name))throw Error('Deletion was not confirmed');
            await add(d.name,blob);
            if(!await same(await lookup(d.name),blob))throw Error('Replacement could not be verified');
            report.items.push({name:d.name,status:'replaced'});
          }catch(error){
            let current;try{current=await lookup(d.name);}catch{throw Error(d.name+': state unknown; stopped. Use the saved backup if recovery is needed.');}
            if(await same(current,blob)){report.items.push({name:d.name,status:'replaced-verified-after-error'});continue;}
            if(!current){try{await add(d.name,backup.blob);if(!await same(await lookup(d.name),backup.blob))throw Error('Restore not verified');report.items.push({name:d.name,status:'restored-original',error:error.message});}catch(restoreError){report.items.push({name:d.name,status:'restore-failed',error:restoreError.message});}}
            else report.items.push({name:d.name,status:'stopped',error:error.message});
            throw error;
          }
        }
        report.status=stopped?'stopped':'complete';update(stopped?'Stopped. Originals backup is retained.':'Complete. Replacements and uploads verified.');
      }catch(error){report.status='stopped-error';report.error=error.message;update('Stopped: '+error.message);}
      finally{busy=false;console.table(report.items);stop.textContent='Close';}
    };
    busy=false;report.status='preview';update('Review the exact-name plan. Nothing has been uploaded or deleted. Download the originals backup to continue.');return report;
  }catch(error){busy=false;report.status='scan-failed';report.error=error.message;update('Scan stopped: '+error.message);throw error;}
}
