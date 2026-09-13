/** Builds the animation brief page from scripts/animation-candidates.json + the 128px delivery rasters. */
import fs from 'node:fs/promises';

const spec = JSON.parse(await fs.readFile('scripts/animation-candidates.json', 'utf8'));
const out = process.argv[2] ?? 'docs/animation-brief.html';

export function buildPrompt(c, variant) {
  const v = c[variant];
  return `Animate the attached emoji into a seamless looping animation. Treat the reference image as the single source of truth for the character's design.

SUBJECT: ${c.subject}.

MOTION: ${v.motion}.

TIMING: ${v.frames} frames at ${v.ms} ms per frame, infinite loop, first and last frame continuous so the cycle has no visible seam. Hold the extreme pose 2-3 frames so the beat reads at 64px.

PRESERVE: the exact character design, palette, line weights, proportions, expression and props of the reference. Same square composition, same crop, same scale - the subject must not drift toward the frame edge or change size between frames. Keep flat fills flat; do not add shading, gradients, fur texture, 3D rendering, realistic anatomy, outlines, drop shadows, motion-blur smears or a sticker border that the reference does not have. Do not add, remove or reword any text, letters, numbers, logos or watermarks. Do not add a background: every frame is fully transparent outside the subject, with opaque subject interiors - including eyes, teeth, white clothing and text.

AMPLITUDE: keep total displacement under ${v.displacement} of the canvas. This is a 32-64px chat emoji: the silhouette change must be legible at 64px, and the character must stay recognizable in every single frame when paused.

OUTPUT: 512x512 animated WebP, square, transparent alpha, loop forever.

REJECT the result if: the character's face or proportions change between frames, the subject drifts or scales, a background or matte appears, text changes, the loop seam is visible, or any frame alone no longer reads as the original emoji.`;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uri = async name => 'data:image/webp;base64,' + (await fs.readFile(`public/emoji-delivery/128/${name}.webp`)).toString('base64');

const ticks = n => Array.from({length: Math.min(n, 34)}, (_, i) => `<i${i % 4 === 0 ? ' class="beat"' : ''}></i>`).join('');

const variantCell = (c, key, label) => `
      <div class="variant ${key}">
        <div class="vhead"><span class="vlabel">${label}</span><span class="vspec">${c[key].frames}f &middot; ${c[key].ms}ms &middot; ${Math.round(1000 / c[key].ms)}fps &middot; &lt;${c[key].displacement}</span></div>
        <div class="strip" aria-hidden="true">${ticks(c[key].frames)}</div>
        <p>${esc(c[key].motion.charAt(0).toUpperCase() + c[key].motion.slice(1))}.</p>
        <details><summary>One-shot prompt</summary><pre>${esc(buildPrompt(c, key))}</pre></details>
      </div>`;

const rows = await Promise.all(spec.candidates.map(async c => `
  <article class="row" id="${c.name}">
    <div class="ident">
      <div class="plate"><img src="${await uri(c.name)}" alt="${c.name} emoji" width="96" height="96"></div>
      <div class="idtext">
        <span class="rank">${String(c.rank).padStart(2, '0')}</span>
        <h2>${esc(c.beat)}</h2>
        <code>:${c.name}:</code>
        <p class="why">${esc(c.why)}</p>
      </div>
    </div>
    <div class="variants">${variantCell(c, 'subtle', 'Subtle')}${variantCell(c, 'full', 'Full')}</div>
  </article>`));

const html = `<title>Blob Cat Dope Sheet</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Public+Sans:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{
  --ground:#faf7ef; --panel:#f3eee1; --rule:#ddd4bd; --ink:#241f14; --ink-soft:#6a6250;
  --accent:#e0a413; --accent-ink:#3d2b05; --hot:#c8502a; --calm:#4a7c6f;
  --display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
  --body:"Public Sans",ui-sans-serif,system-ui,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#15130d; --panel:#1e1b13; --rule:#3a3426; --ink:#f1ece0; --ink-soft:#9c9482;
  --accent:#f5c12a; --accent-ink:#1a1508; --hot:#e8794f; --calm:#7bb5a5;
}}
:root[data-theme="dark"]{
  --ground:#15130d; --panel:#1e1b13; --rule:#3a3426; --ink:#f1ece0; --ink-soft:#9c9482;
  --accent:#f5c12a; --accent-ink:#1a1508; --hot:#e8794f; --calm:#7bb5a5;
}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:var(--body);line-height:1.55;
  padding-inline:20px;padding-block:0;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:40px;padding-block:56px 80px}
header{display:flex;flex-direction:column;gap:14px;max-width:62ch}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft)}
h1{font-family:var(--display);font-weight:700;font-size:clamp(34px,6vw,54px);line-height:1.02;margin:0;
  letter-spacing:-.02em;text-wrap:balance}
.lede{margin:0;font-size:17px;color:var(--ink-soft)}
.lede em{color:var(--ink);font-style:normal;font-weight:600}
.specbar{display:flex;flex-wrap:wrap;gap:0 28px;font-family:var(--mono);font-size:12px;
  color:var(--ink-soft);border-block:1px solid var(--rule);padding-block:12px;font-variant-numeric:tabular-nums}
.specbar b{color:var(--ink);font-weight:600}
.sheet{display:flex;flex-direction:column}
.row{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2.1fr);gap:28px;
  padding-block:30px;border-top:1px solid var(--rule)}
.row:last-child{border-bottom:1px solid var(--rule)}
.ident{display:flex;gap:16px;align-items:flex-start}
.plate{flex:none;width:96px;height:96px;display:grid;place-items:center;background:var(--panel);
  border-radius:4px;background-image:linear-gradient(45deg,rgba(128,128,128,.08) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.08) 75%),
  linear-gradient(45deg,rgba(128,128,128,.08) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.08) 75%);
  background-size:16px 16px;background-position:0 0,8px 8px}
.plate img{width:80px;height:80px;max-width:100%;image-rendering:auto}
.idtext{display:flex;flex-direction:column;gap:6px;min-width:0}
.rank{font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:600;letter-spacing:.1em}
h2{font-family:var(--display);font-size:23px;font-weight:700;margin:0;letter-spacing:-.01em;line-height:1.1}
.idtext code{font-family:var(--mono);font-size:12px;color:var(--ink-soft);word-break:break-all}
.why{margin:6px 0 0;font-size:14px;color:var(--ink-soft)}
.variants{display:grid;grid-template-columns:1fr 1fr;gap:24px;min-width:0}
.variant{display:flex;flex-direction:column;gap:9px;min-width:0}
.vhead{display:flex;flex-direction:column;gap:2px}
.vlabel{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.subtle .vlabel{color:var(--calm)}
.full .vlabel{color:var(--hot)}
.vspec{font-family:var(--mono);font-size:11px;color:var(--ink-soft);font-variant-numeric:tabular-nums}
.strip{display:flex;gap:2px;height:12px;align-items:flex-end}
.strip i{display:block;width:3px;height:6px;background:var(--rule)}
.subtle .strip i.beat{background:var(--calm);height:12px}
.full .strip i.beat{background:var(--hot);height:12px}
.variant p{margin:0;font-size:14px}
details{margin-top:2px}
summary{font-family:var(--mono);font-size:11px;color:var(--ink-soft);cursor:pointer;
  letter-spacing:.06em;text-transform:uppercase;width:fit-content}
summary:hover{color:var(--ink)}
summary:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
pre{font-family:var(--mono);font-size:11.5px;line-height:1.6;white-space:pre-wrap;margin:10px 0 0;
  padding:14px;background:var(--panel);border-left:2px solid var(--accent);color:var(--ink);
  max-height:320px;overflow:auto}
footer{display:flex;flex-direction:column;gap:10px;max-width:62ch;font-size:14px;color:var(--ink-soft)}
footer h3{font-family:var(--display);font-size:16px;margin:0;color:var(--ink);font-weight:700}
footer code{font-family:var(--mono);font-size:12.5px;color:var(--ink)}
@media (max-width:860px){
  .row{grid-template-columns:1fr;gap:20px}
  .variants{grid-template-columns:1fr;gap:20px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
<div class="wrap">
<header>
  <span class="eyebrow">Batch 01 &middot; 10 stills &rarr; loops</span>
  <h1>Blob Cat Dope Sheet</h1>
  <p class="lede">Ten of the 270 still emoji, ranked by how much motion the pose already owes. Each one gets two timings: a <em>subtle</em> loop that survives Slack&rsquo;s 128&nbsp;KB cap at 256px, and a <em>full</em> take that will likely need the 128px rung. Prompts are copy-ready against the source still.</p>
  <div class="specbar">
    <span>Canvas <b>512&times;512</b></span><span>Loop <b>infinite</b></span><span>Alpha <b>required</b></span>
    <span>Reference set <b>81 animated</b></span><span>Measured <b>20&ndash;180&nbsp;ms/frame</b></span>
  </div>
</header>
<main class="sheet">${rows.join('')}
</main>
<footer>
  <h3>Before rendering</h3>
  <p>The existing 81 animations were imported and restored, never generated from a still &mdash; so nothing in <code>scripts/emoji-enhancement/</code> handles identity drift or per-frame alpha from a video model. Both are unsolved for this batch: video models return opaque frames on a background, and matting 30 frames independently is what produced the halo regressions already logged in <code>finalize-still-fallbacks.mjs</code>.</p>
  <p>Rigging the existing flat-vector layers and tweening them sidesteps both problems for the nine blob cats. Only <code>old-man-yells-at-cloud</code> really needs a generative pass.</p>
</footer>
</div>
`;

await fs.writeFile(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + 'KB');
