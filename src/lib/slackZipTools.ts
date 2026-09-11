import type JSZip from 'jszip';
import {generateSlackBrowserScript, slackPayloadDecoder} from './slackBrowserScript';
import {SLACK_SCRIPT_LIMIT, type SlackPlan} from './slackExportPlan';

/** A portable Node script uses the same uploader templates as the browser. */
export function addSlackZipTools(zip: JSZip, plan: SlackPlan, data: Uint8Array[]) {
  plan.assets.forEach((asset,index) => zip.file(`slack/images/${asset.filename}`,data[index]));
  zip.file('slack/resolutions.json',JSON.stringify(plan.resolutions,null,2));
  const plainTemplate = generateSlackBrowserScript([]);
  const compactTemplate = plainTemplate.replace('const images = [];',`const images = ${slackPayloadDecoder('__EMOJI_PAYLOAD__')};`);
  zip.file('slack/generate.mjs',`import {readdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const directory = new URL('./images/',import.meta.url);
const names = (await readdir(directory)).filter(name=>name.endsWith('.webp')).sort();
if (!names.length) throw Error('No WebP images found in slack/images');
const images = [];
for (const filename of names) images.push({filename,mimeType:'image/webp',base64:(await readFile(new URL(encodeURIComponent(filename),directory))).toString('base64')});
const json = JSON.stringify(images);
const plain = ${JSON.stringify(plainTemplate)}.replace('const images = [];',()=> 'const images = '+json+';');
const compact = ${JSON.stringify(compactTemplate)}.replace('__EMOJI_PAYLOAD__',()=>gzipSync(json).toString('base64'));
const script = Buffer.byteLength(compact)<Buffer.byteLength(plain)?compact:plain;
const bytes = Buffer.byteLength(script);
if (bytes >= ${SLACK_SCRIPT_LIMIT}) throw Error('Script exceeds 8 MB. Move some files out of slack/images and run again.');
const output = new URL('../slack-upload.js',import.meta.url);
await writeFile(output,script);
console.log(names.length+' emojis · '+(bytes/1e6).toFixed(3)+' MB written to '+output.pathname);
console.log('Copy slack-upload.js into Slack DevTools. On macOS: pbcopy < slack-upload.js');
`);
  zip.file('generate-slack-script.sh',`#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 18 or newer to generate the Slack script.' >&2; exit 1; }
exec node slack/generate.mjs
`,{unixPermissions:'755'});
  zip.file('SLACK-README.txt',`Full-resolution WebP originals are at the archive root.
The separate slack/images folder contains the optimized selection:
${plan.resolutions.map(r=>`${r.count} ${r.animated?'animated':'still'} at ${r.size}x${r.size}`).join('\n')}

Run: sh generate-slack-script.sh
Requires Node.js 18 or newer; no packages, network access or Slack token needed.
If the selection is too large even at 64px, move some files out of
slack/images before running the generator. The original ZIP is still usable.
This creates slack-upload.js, capped below 8,000,000 UTF-8 bytes.
Open your workspace's /customize/emoji page, paste that file's text into
DevTools Console and press Enter once. Large pastes may briefly pause DevTools.
On macOS you can copy it with: pbcopy < slack-upload.js

This is the normal uploader, without automatic deletion/replacement.
To upload fewer images, move files out of slack/images and run again.
To get larger optimized images, select fewer emojis in Emoji Brain and export
a new ZIP. Root originals are preserved; the generator uses slack/images only.
`);
}
