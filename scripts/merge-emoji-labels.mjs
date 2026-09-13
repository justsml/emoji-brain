#!/usr/bin/env node
// Merges the per-shard labelling output into the catalog, refusing anything the
// vocabulary does not allow. Labels arrive from a model, so every field is
// treated as untrusted until checked against src/data/tag-vocabulary.json.
//
//   node scripts/merge-emoji-labels.mjs <dir-with-out-*.jsonl> [--write]
//
// Without --write it only reports. With --write it updates emoji-metadata.json,
// replacing each emoji's `tags`/`categories` with the canonical facets.

import {readFileSync, writeFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

const [dir, ...flags] = process.argv.slice(2);
if (!dir) { console.error("usage: merge-emoji-labels.mjs <dir> [--write]"); process.exit(2); }
const write = flags.includes("--write");

const vocab = JSON.parse(readFileSync("src/data/tag-vocabulary.json", "utf8"));
const catalog = JSON.parse(readFileSync("src/data/emoji-metadata.json", "utf8"));
const facetOf = new Map(vocab.tags.map(t => [t.id, t.facet]));
const facets = Object.entries(vocab.facets);
// "1-2" / "0-3" — the contract each facet's tag list has to satisfy.
const bounds = Object.fromEntries(facets.map(([id, f]) => {
  const [lo, hi] = f.cardinality.split("-").map(Number);
  return [id, {lo: f.required ? Math.max(lo, 1) : lo, hi}];
}));

const rows = new Map();
const errors = [];
const dupes = [];
// `out-*` is the first labelling pass, `rev-*` the revision pass against a later
// vocabulary. Revisions load second and deliberately overwrite, so only rows a
// reviser never saw keep their original labels.
const files = readdirSync(dir);
const revised = new Set();
for (const file of [...files.filter(f => /^out-\d+\.jsonl$/.test(f)).sort(),
                    ...files.filter(f => /^rev-\d+\.jsonl$/.test(f)).sort()]) {
  const isRevision = file.startsWith("rev-");
  const lines = readFileSync(join(dir, file), "utf8").split("\n").filter(l => l.trim());
  lines.forEach((line, i) => {
    let row;
    try { row = JSON.parse(line); }
    catch { errors.push(`${file}:${i + 1} unparseable JSON`); return; }
    if (!row.id) { errors.push(`${file}:${i + 1} missing id`); return; }
    if (isRevision) {
      if (revised.has(row.id)) { dupes.push(`${row.name || row.id} (${file})`); return; }
      revised.add(row.id);
    } else if (rows.has(row.id)) { dupes.push(`${row.name || row.id} (${file})`); return; }
    rows.set(row.id, {...row, _src: file});
  });
}
const catalogIds = new Set(catalog.emojis.map(e => e.id));
const byId = new Map(catalog.emojis.map(e => [e.id, e]));

// An emoji deleted from the catalog after labelling leaves an orphan row.
const orphans = [...rows.keys()].filter(id => !catalogIds.has(id));
for (const id of orphans) rows.delete(id);

for (const [id, row] of rows) {
  const where = `${row.name || id}`;
  if (!catalogIds.has(id)) { errors.push(`${where}: id not in catalog`); continue; }
  for (const [facet] of facets) {
    const list = row[facet];
    if (!Array.isArray(list)) { errors.push(`${where}: ${facet} is not an array`); continue; }
    const {lo, hi} = bounds[facet];
    if (list.length < lo) errors.push(`${where}: ${facet} needs >=${lo}, got ${list.length}`);
    if (list.length > hi) errors.push(`${where}: ${facet} allows <=${hi}, got ${list.length}`);
    if (new Set(list).size !== list.length) errors.push(`${where}: ${facet} has duplicates`);
    for (const tag of list) {
      if (!facetOf.has(tag)) errors.push(`${where}: unknown tag "${tag}"`);
      else if (facetOf.get(tag) !== facet) errors.push(`${where}: "${tag}" belongs to ${facetOf.get(tag)}, listed under ${facet}`);
    }
  }
}

const missing = [...catalogIds].filter(id => !rows.has(id)).map(id => byId.get(id).filename);

// --- report -----------------------------------------------------------------
const count = new Map();
const facetFill = Object.fromEntries(facets.map(([f]) => [f, 0]));
for (const row of rows.values()) {
  for (const [f] of facets) {
    if (Array.isArray(row[f]) && row[f].length) facetFill[f]++;
    for (const tag of row[f] || []) count.set(tag, (count.get(tag) || 0) + 1);
  }
}
const pct = n => `${((n / rows.size) * 100).toFixed(0)}%`;
console.log(`labelled ${rows.size} / ${catalog.emojis.length} emojis (${revised.size} revised in pass 2)`);
if (orphans.length) console.log(`dropped ${orphans.length} row(s) for emojis no longer in the catalog`);
if (dupes.length) console.log(`duplicate rows dropped: ${dupes.length} — ${dupes.slice(0, 5).join(", ")}`);
if (missing.length) console.log(`MISSING (${missing.length}): ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " …" : ""}`);
console.log(`\nfacet fill:`);
for (const [f] of facets) console.log(`  ${f.padEnd(11)} ${String(facetFill[f]).padStart(3)}  ${pct(facetFill[f])}`);

const unused = vocab.tags.filter(t => !count.has(t.id));
console.log(`\nvocabulary used: ${vocab.tags.length - unused.length} / ${vocab.tags.length} tags`);
if (unused.length) console.log(`  never applied: ${unused.map(t => `${t.id}(${t.facet})`).join(", ")}`);

const low = [...rows.values()].filter(r => r.confidence === "low");
if (low.length) console.log(`\nlow confidence (${low.length}): ${low.map(r => r.name).slice(0, 20).join(", ")}`);
const notes = [...rows.values()].filter(r => r.note && r.note.trim());
if (notes.length) {
  console.log(`\nvocabulary gaps flagged (${notes.length}):`);
  for (const r of notes) console.log(`  ${r.name}: ${r.note}`);
}

console.log(`\ntop tags: ${[...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, n]) => `${t}:${n}`).join("  ")}`);

if (errors.length) {
  console.log(`\n${errors.length} VALIDATION ERRORS:`);
  for (const e of errors.slice(0, 40)) console.log(`  ${e}`);
  if (errors.length > 40) console.log(`  … ${errors.length - 40} more`);
}

if (!write) { console.log(`\n(dry run — pass --write to update the catalog)`); process.exit(errors.length ? 1 : 0); }
if (errors.length) { console.error(`\nrefusing to write with ${errors.length} errors`); process.exit(1); }
if (missing.length) { console.error(`\nrefusing to write with ${missing.length} unlabelled emojis`); process.exit(1); }

for (const emoji of catalog.emojis) {
  const row = rows.get(emoji.id);
  emoji.facets = Object.fromEntries(facets.map(([f]) => [f, row[f]]));
  // Flat `tags` stays as the search index and the tag cloud's input.
  emoji.tags = [...new Set(facets.flatMap(([f]) => row[f]))];
  emoji.categories = row.subject;
  delete emoji.labelProvenance;
  emoji.labelConfidence = row.confidence;
}
catalog.lastUpdated = new Date().toISOString();
writeFileSync("src/data/emoji-metadata.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(`\nwrote src/data/emoji-metadata.json`);
