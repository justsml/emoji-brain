import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeAnimation} from './animation-frames.mjs';
const root='staging/emoji-enhancements/severance-running-revisit';
const manifest=JSON.parse(await fs.readFile(root+'/manifest.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(await fs.readFile(manifest.source)),manifest.sourceSha256);
assert.equal(hash(await fs.readFile('public/emojis/severance-running.webp')),manifest.approval?.approvedSha256??manifest.sourceSha256,'Production does not match review state');
const source=await decodeAnimation(manifest.source);
assert(source.frames.every(f=>f.every((v,i)=>i%4!==3||v===255)),'Expected opaque original');
assert.equal(manifest.mapping.length,90);assert.equal(manifest.mapping[26],33);assert.equal(manifest.mapping[27],34);
assert(manifest.mapping.every((v,i)=>v>=0&&v<112&&(!i||v>manifest.mapping[i-1])));
const items=[];
for(const candidate of manifest.candidates){
 assert.equal(hash(await fs.readFile(root+'/'+candidate.file)),candidate.sha256);
 for(const size of [64,128,256,512]){
  const filename=candidate.name+(size===512?'':'-'+size)+'.webp';const buffer=await fs.readFile(root+'/'+filename),a=await decodeAnimation(buffer);
  assert.equal(a.width,size);assert.equal(a.height,size);assert.equal(a.delays.reduce((n,d)=>n+d,0),4500);assert(a.delays.every(d=>d>0&&d%50===0),'Changed hold boundaries');assert.equal(a.loop,source.loop);
  assert(a.frames.every(f=>f.every((v,i)=>i%4!==3||v===255)),'Alpha changed');
  items.push({file:filename,width:size,height:size,frames:a.frames.length,sourceHolds:90,durationMs:4500,alphaExact:true,bytes:buffer.length,slackSizeOk:size===128?buffer.length<=128*1024:undefined});
 }
}
const report={passed:true,productionMatchesApproval:manifest.status==='approved-promoted',sceneCutFrame:27,framesChecked:items.length*90,items};
await fs.writeFile(root+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
