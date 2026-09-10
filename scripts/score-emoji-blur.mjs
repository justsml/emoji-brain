import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Crete reblur principle: measure how much directional edge energy survives
// an additional fixed 11-pixel box blur. Higher values indicate softer edges.
export function reblurScore(pixels, width, height) {
  const at = (a, x, y) => a[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  const directions = [];
  for (const axis of [0, 1]) {
    const blurred = new Float64Array(pixels.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      for (let k = -5; k <= 5; k++) blurred[y * width + x] += at(pixels, x + (axis === 0 ? k : 0), y + (axis === 1 ? k : 0)) / 11;
    }
    const gradient = (a, x, y) => {
      let g = 0;
      for (let k = -1; k <= 1; k++) {
        const weight = k === 0 ? 2 : 1;
        g += weight * (axis === 0 ? at(a, x + 1, y + k) - at(a, x - 1, y + k) : at(a, x + k, y + 1) - at(a, x + k, y - 1));
      }
      return Math.abs(g);
    };
    let energy = 0, lost = 0;
    for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
      const original = gradient(pixels, x, y), extra = gradient(blurred, x, y);
      energy += original;
      lost += Math.max(0, original - extra);
    }
    if (energy > 1e-8) directions.push(1 - lost / energy);
  }
  return directions.length ? 100 * Math.max(...directions) : null;
}

export async function scoreEmoji(file) {
  const meta = await sharp(file, { animated: true }).metadata();
  const { data, info } = await sharp(file, { page: 0, pages: 1 })
    .resize({ width: 128, height: 128, fit: 'inside', kernel: 'lanczos3' })
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const scores = [0, 255].map(background => {
    const gray = new Float64Array(info.width * info.height);
    for (let i = 0; i < gray.length; i++) {
      const alpha = data[i * 4 + 3] / 255;
      gray[i] = alpha * (.2126 * data[i * 4] + .7152 * data[i * 4 + 1] + .0722 * data[i * 4 + 2]) + (1 - alpha) * background;
    }
    return reblurScore(gray, info.width, info.height);
  }).filter(value => value !== null);
  return { file: path.basename(file), score: scores.length ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 10) / 10 : null,
    width: meta.width, height: meta.pageHeight ?? meta.height, frames: meta.pages ?? 1,
    animated: (meta.pages ?? 1) > 1, note: scores.length ? '' : 'No measurable edges; blur is indeterminate' };
}

async function main() {
  const input = path.resolve(process.argv[2] ?? 'public/emojis');
  const output = path.resolve(process.argv[3] ?? 'experiments/image-enhancement/blur-scores');
  await fs.mkdir(path.join(output, 'thumbnails'), { recursive: true });
  const files = (await fs.readdir(input, { withFileTypes: true })).filter(e => e.isFile() && /\.(webp|png|gif|jpe?g)$/i.test(e.name)).map(e => e.name).sort();
  const reviews = JSON.parse(await fs.readFile(new URL('./emoji-quality-reviews.json', import.meta.url), 'utf8'));
  const rows = [];
  for (const file of files) {
    rows.push({ ...await scoreEmoji(path.join(input, file)), review: reviews[file] ?? { category: 'Unreviewed', action: 'Visual review required; do not auto-route from blur score', provenance: 'Not reviewed' } });
    await sharp(path.join(input, file), { page: 0, pages: 1 }).resize({width:128,height:128,fit:'inside'}).png().toFile(path.join(output, 'thumbnails', `${file}.png`));
  }
  rows.sort((a,b) => (b.score ?? -1) - (a.score ?? -1) || a.file.localeCompare(b.file));
  rows.forEach((row,i) => row.rank = i+1);
  const method = '0 = sharpest, 100 = strongest blur. Heuristic Crete-style reblur score: first decoded frame, longest side resized to 128 px with Lanczos3, luminance on black and white backgrounds, 11 px directional box reblur, Sobel gradients, maximum direction then mean background score. No direct resolution penalty. Flat gradients and intentional soft artwork can score high; noise and crisp silhouettes can mask internal blur. Scores are not probabilities or human-calibrated quality ratings. Reviewed categories and handling instructions are separate user annotations, not metric predictions; they take precedence for enhancement routing. Null means no measurable edges.';
  await fs.writeFile(path.join(output,'scores.json'), JSON.stringify({createdAt:new Date().toISOString(),input,method,count:rows.length,animated:rows.filter(r=>r.animated).length,rows},null,2)+'\n');
  await fs.writeFile(path.join(output,'scores.csv'), 'rank,file,blur_score,width,height,frames,animated,note,review_category,review_action,review_provenance\n'+rows.map(r=>[r.rank,r.file,r.score??'',r.width,r.height,r.frames,r.animated,r.note,r.review.category,r.review.action,r.review.provenance].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
  await fs.writeFile(path.join(output,'scores.md'), `# Emoji blur scores\n\n${method}\n\nCanonical catalog originals; experimental enhancements excluded. Sorted blurriest first.\n\n| Rank | Emoji | Blur / 100 | Size | Frames | Review | Handling |\n|---:|---|---:|---|---:|---|---|\n`+rows.map(r=>`| ${r.rank} | ${r.file} | ${r.score??'N/A'} | ${r.width} × ${r.height} | ${r.frames} | ${r.review.category} | ${r.review.action} |`).join('\n')+'\n');
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  await fs.writeFile(path.join(output,'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Emoji blur scores</title><style>body{font:15px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#20242c}p{line-height:1.6}input{padding:10px;width:300px}table{border-collapse:collapse;width:100%;margin-top:20px}th{text-align:left;position:sticky;top:0;background:white}td,th{padding:10px;border-bottom:1px solid #ddd}img{width:72px;height:72px;object-fit:contain;background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0/16px 16px}.score{font-variant-numeric:tabular-nums;font-weight:650}</style><h1>Emoji blur scores</h1><p>${rows.length} catalog originals · ${rows.filter(r=>r.animated).length} animations scored using only their first frame. Sorted blurriest first.</p><p>${esc(method)}</p><p><a href="scores.csv">Download CSV</a> · <a href="scores.md">Full Markdown table</a> · <a href="scores.json">JSON and methodology</a></p><input id="filter" aria-label="Filter emoji names" placeholder="Filter emoji names"><table><thead><tr><th>Rank</th><th>First frame</th><th>Emoji</th><th>Blur / 100</th><th>Original size</th><th>Frames</th><th>Review / handling</th></tr></thead><tbody>${rows.map(r=>`<tr data-name="${esc(r.file.toLowerCase())}"><td>${r.rank}</td><td><img loading="lazy" src="thumbnails/${encodeURIComponent(r.file)}.png" alt="${esc(r.file)}"></td><td>${esc(r.file)}</td><td class="score">${r.score??'N/A'}</td><td>${r.width} × ${r.height}</td><td>${r.frames}${r.animated?' (first scored)':''}</td><td><strong>${esc(r.review.category)}</strong><br>${esc(r.review.action)}<br><small>${esc(r.review.provenance)}</small></td></tr>`).join('')}</tbody></table><script>document.querySelector('#filter').addEventListener('input',e=>{for(const row of document.querySelectorAll('tbody tr'))row.hidden=!row.dataset.name.includes(e.target.value.toLowerCase())})</script></html>`);
  console.log(JSON.stringify({count:rows.length,animated:rows.filter(r=>r.animated).length,indeterminate:rows.filter(r=>r.score===null).length,top:rows.slice(0,15),output},null,2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
