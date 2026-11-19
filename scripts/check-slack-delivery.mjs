// Read-only production CORS/integrity probe. No Slack credentials required.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin = process.argv[2] || 'https://adorbs.fun';
const slackOrigin = 'https://focuseddotio.slack.com';
const {items} = JSON.parse(await fs.readFile('public/emoji-delivery/manifest.json', 'utf8'));
const animation = Object.values(items).find(row => row.animated).variants['64'].webp.path;
const paths = ['/emoji-delivery/manifest.json', ...['64','128','256','original'].map(size => `/emoji-delivery/${size}/50.webp`), animation];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const path of paths) {
  const response = await fetch(new URL(path, origin), {headers:{Origin:slackOrigin}, credentials:'omit', redirect:'error', signal:AbortSignal.timeout(20000)});
  const bytes = Buffer.from(await response.arrayBuffer());
  const matches = sha(bytes) === sha(await fs.readFile('public' + path));
  const cors = response.headers.get('access-control-allow-origin');
  console.log(JSON.stringify({path,status:response.status,cors,bytes:bytes.length,sha256:sha(bytes),matches}));
  if (!response.ok || !['*',slackOrigin].includes(cors) || !matches) process.exitCode = 1;
}
const preflight = await fetch(new URL(paths[1], origin), {method:'OPTIONS',headers:{Origin:slackOrigin,'Access-Control-Request-Method':'GET'},signal:AbortSignal.timeout(20000)});
console.log(JSON.stringify({method:'OPTIONS',status:preflight.status,cors:preflight.headers.get('access-control-allow-origin'),note:'Uploader uses a simple GET without custom headers; preflight support is not required.'}));
