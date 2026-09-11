import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const path='public/emoji-delivery/manifest.json';
const manifest=JSON.parse(await fs.readFile(path,'utf8'));
let count=0;
for(const [name,row] of Object.entries(manifest.items))for(const variant of Object.values(row.variants)) {
 const asset=variant.webp;
 const bytes=await fs.readFile('public'+asset.path);
 if(bytes.length!==asset.bytes)throw Error('Stale delivery asset: '+asset.path);
 // Individual gzip streams slightly overestimate a combined stream because
 // their headers and dictionaries are not shared. Runtime checks the real size.
 asset.slackGzipBytes=gzipSync(JSON.stringify([{filename:name+'.webp',mimeType:'image/webp',base64:bytes.toString('base64')}])).length;
 count++;
}
await fs.writeFile(path+'.tmp',JSON.stringify(manifest,null,2)+'\n');
await fs.rename(path+'.tmp',path);
console.log('Updated Slack size estimates for '+count+' existing WebPs; no images re-encoded.');
