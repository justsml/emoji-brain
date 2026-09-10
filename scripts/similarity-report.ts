import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { POLICY, atomicWrite, type PipelineResult } from './similarity-pipeline';
import { duplicateCandidates, evaluate, methods, ranking, type Judgments, type ReviewQuery } from './similarity-evaluation';

const safeJson = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');

export async function writeSimilarityReport(root: string, destination: string, result: PipelineResult, queries: ReviewQuery[], judgments?: Judgments) {
  const items: Record<string, unknown> = {};
  for (const e of result.images) {
    const descriptor = result.descriptors[e.id];
    const thumbnail = await sharp(path.join(root, 'public/emojis', e.filename)).resize(72, 72, { fit: 'inside' }).png().toBuffer();
    items[e.id] = { name: e.filename, src: `data:image/png;base64,${thumbnail.toString('base64')}`,
      original: pathToFileURL(path.join(root, 'public/emojis', e.filename)).href,
      palette: descriptor.palette, frames: descriptor.frames.map(f => ({ mask: f.mask, edges: f.edges, weight: f.weight, informative: f.silhouetteInformative })),
      animated: descriptor.animated, sampledFrames: descriptor.sampledFrames };
  }
  const available = queries.filter(q => items[q.id]);
  const lists = Object.fromEntries(available.map(q => [q.id, Object.fromEntries(methods.map(m => [m, ranking(result, q.id, m)]))]));
  const evaluation = evaluate(result, available, judgments);
  const payload = { items, queries: available, lists, judgments: judgments ?? { catalogHash: result.index.catalogHash, version: result.index.version, reviewer: '', ratings: [] },
    evaluation, duplicates: duplicateCandidates(result.pairs, POLICY.duplicateCutoff), policy: POLICY };
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Emoji similarity review</title>
<style>body{font:16px system-ui;background:#f8f7f3;color:#20211e;margin:24px;line-height:1.5}button,select,input{font:inherit;padding:6px;margin:4px}button{cursor:pointer}header{max-width:1000px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.card{background:white;border:1px solid #ccc;padding:12px;border-radius:8px;overflow-wrap:anywhere}.card img{width:72px;height:72px;object-fit:contain}.swatch{display:inline-block;width:20px;height:16px;border:1px solid #999}canvas{width:64px;height:64px;image-rendering:pixelated;background:#eee;margin:3px}pre{white-space:pre-wrap}label{display:inline-block}details{margin:12px 0}.comparison{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:12px;overflow-x:auto}.comparison .grid{grid-template-columns:1fr}.notice{background:#fff3ca;padding:12px}#status{min-height:24px}a{color:#124c85}</style>
<header><h1>Emoji similarity review</h1><p class="notice">Defaults are provisional. No human relevance judgments or measured gains are implied. Grade palette resemblance separately from overall visual resemblance. Tune on the tuning split; reserve held-out queries for confirmation.</p>
<p>Thumbnails show the first frame; open the original to inspect animation. Masks and edges below show every sampled frame with its duration weight. This measures appearance, not motion meaning.</p>
<label>Query <select id="query"></select></label><label>Method <select id="method"><option value="histogram">64-bin baseline</option><option value="color">Palette transport</option><option value="layout">Layout baseline</option><option value="visual">Combined visual</option></select></label>
<label><input type="checkbox" id="compare">Compare methods side by side</label>
<label>Human reviewer <input id="reviewer" placeholder="Your name"></label><button id="export">Export judgments</button><label>Import judgments <input type="file" id="import" accept="application/json"></label><p id="status" role="status"></p></header>
<h2>Query</h2><div id="source"></div><h2>Neighbors</h2><div class="grid" id="results"></div>
<details><summary>Runtime, coverage, and judged metrics</summary><pre id="metrics"></pre></details>
<details><summary>Possible duplicate review (never auto-merged)</summary><p>Exact content hashes are separate from perceptual candidates. DCT Hamming ≤6 is a provisional review threshold. Animated perceptual matching is unsupported; exact file matches can still appear.</p><div class="grid" id="duplicates"></div></details>
<script id="data" type="application/json">${safeJson(payload)}</script><script>
const data=JSON.parse(document.getElementById('data').textContent), $=id=>document.getElementById(id);
const saved=data.judgments; $('reviewer').value=saved.reviewer;
const storageKey='emoji-review/'+saved.catalogHash+'/'+saved.version;
function validateJudgments(j,requireReviewer){
if(!j||j.catalogHash!==saved.catalogHash||j.version!==saved.version||typeof j.reviewer!=='string'||(requireReviewer&&!j.reviewer.trim())||!Array.isArray(j.ratings))throw Error('Invalid judgments or different catalog/version');
const keys=new Set();for(const r of j.ratings){if(!r||!data.queries.some(q=>q.id===r.query)||!Object.hasOwn(data.items,r.candidate)||r.query===r.candidate||!['color','visual'].includes(r.mode)||![0,1,2].includes(r.grade))throw Error('Invalid relevance judgment');const key=JSON.stringify([r.query,r.candidate,r.mode]);if(keys.has(key))throw Error('Duplicate relevance judgment');keys.add(key);}return j;
}
try{const raw=localStorage.getItem(storageKey);if(raw){const prior=validateJudgments(JSON.parse(raw),false);saved.ratings=prior.ratings;saved.reviewer=prior.reviewer;$('reviewer').value=prior.reviewer;}}catch{}
function persist(){saved.reviewer=$('reviewer').value;try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{}$('status').textContent=saved.ratings.length+' judgments recorded. Export to retain a portable copy.';}
function el(tag,text){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;}
function card(id){const item=data.items[id], c=el('div');c.className='card';const a=el('a',item.name);a.href=item.original;a.target='_blank';a.rel='noopener';const img=el('img');img.src=item.src;img.alt=item.name;c.append(img,el('br'),a);
const colors=el('div');for(const p of item.palette){const s=el('span');s.className='swatch';s.style.background=p.hex;s.title=p.hex+' '+Math.round(p.weight*100)+'%';colors.append(s);}c.append(colors);
const d=el('details'),summary=el('summary','Masks / edges'+(item.animated?' · animated, '+item.sampledFrames+' samples':''));d.append(summary);
for(const f of item.frames){d.append(el('div','Weight '+f.weight.toFixed(3)+(f.informative?'':' · silhouette uninformative')));for(const kind of ['mask','edges']){const canvas=el('canvas');canvas.width=canvas.height=32;canvas.title=kind;const ctx=canvas.getContext('2d');for(let i=0;i<f[kind].length;i++){const v=Math.max(0,Math.min(255,Math.round(f[kind][i]*255)));ctx.fillStyle='rgb('+v+','+v+','+v+')';ctx.fillRect(i%32,Math.floor(i/32),1,1);}d.append(canvas);}}c.append(d);return c;}
for(const q of data.queries){const o=el('option',q.filename+' · '+q.category+' · '+q.split);o.value=q.id;$('query').append(o);}
function renderMethod(q,m,target){const mode=m==='histogram'||m==='color'?'color':'visual';for(const n of data.lists[q][m]){const c=card(n.id);c.append(el('p','Distance '+n.distance.toFixed(4)));const details=el('details');details.append(el('summary','Component distances'),el('pre',JSON.stringify(n.components,null,2)));c.append(details);const label=el('label','Relevance: '),select=el('select');select.setAttribute('aria-label','Relevance of '+data.items[n.id].name);select.dataset.ratingKey=JSON.stringify([q,n.id,mode]);for(const [v,t] of [['','Unjudged'],['0','Unrelated'],['1','Partial'],['2','Relevant']]){const o=el('option',t);o.value=v;select.append(o);}const existing=saved.ratings.find(r=>r.query===q&&r.candidate===n.id&&r.mode===mode);select.value=existing?String(existing.grade):'';select.onchange=()=>{saved.ratings=saved.ratings.filter(r=>!(r.query===q&&r.candidate===n.id&&r.mode===mode));if(select.value!=='')saved.ratings.push({query:q,candidate:n.id,mode,grade:Number(select.value)});for(const other of document.querySelectorAll('select[data-rating-key]'))if(other.dataset.ratingKey===select.dataset.ratingKey)other.value=select.value;persist();};label.append(select);c.append(label);target.append(c);}if(!data.lists[q][m].length)target.append(el('p','No matches meet this method’s cutoff.'));}
function render(){const q=$('query').value;if(!q)return;$('source').replaceChildren(card(q));$('results').replaceChildren();const compare=$('compare').checked;$('results').className=compare?'comparison':'grid';$('method').disabled=compare;if(compare){for(const [m,title] of [['histogram','64-bin baseline'],['color','Palette transport'],['layout','Layout baseline'],['visual','Combined visual']]){const column=el('section');column.append(el('h3',title));const list=el('div');list.className='grid';column.append(list);$('results').append(column);renderMethod(q,m,list);}}else renderMethod(q,$('method').value,$('results'));}
$('query').onchange=$('method').onchange=$('compare').onchange=render;$('reviewer').oninput=persist;
$('export').onclick=()=>{persist();if(!saved.reviewer.trim()){$('status').textContent='Enter the human reviewer name before exporting.';return;}const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='similarity-judgments.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;const j=validateJudgments(JSON.parse(await file.text()),true);saved.ratings=j.ratings;saved.reviewer=j.reviewer;$('reviewer').value=j.reviewer;persist();render();}catch(e){$('status').textContent=e.message;}};
$('metrics').textContent=JSON.stringify(data.evaluation,null,2)+'\\nMetrics reflect the judgments supplied when generating this report. Export and rerun with --judgments to recalculate.';
for(const p of data.duplicates){const c=el('div');c.className='card';c.append(el('p',p.exact?'Exact file match':'Perceptual candidate · Hamming '+p.hamming),card(p.a),card(p.b));$('duplicates').append(c);}render();persist();
</script></html>`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, html);
  await atomicWrite(`${destination}.metrics.json`, evaluation);
  return evaluation;
}
