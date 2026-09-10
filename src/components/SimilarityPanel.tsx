import { useEffect, useMemo, useRef, useState } from "react";
import type { EmojiMetadata } from "../types/emoji";
import type { PaletteColor, SimilarityEntry } from "../types/similarity";
import { stillSrc } from "../lib/utils";
import "../styles/similarity.css";

// Parse only the fields used by the UI. Untrusted/stale references never become URLs.
function parseEntries(value: unknown): Record<string, SimilarityEntry> {
  if (!value || typeof value !== "object" || !("entries" in value) ||
    !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) throw new Error("Invalid index");
  const entries: Record<string, SimilarityEntry> = Object.create(null);
  for (const [id, raw] of Object.entries(value.entries)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as SimilarityEntry;
    if (!Array.isArray(entry.palette) || !Array.isArray(entry.color) || !Array.isArray(entry.visual)) continue;
    const palette = entry.palette.filter((p) => p && /^#[0-9a-f]{6}$/i.test(p.hex) && Number.isFinite(p.weight) && p.weight > 0 && p.weight <= 1).slice(0, 8);
    const valid = (neighbors: SimilarityEntry["color"]) => neighbors.filter((n) => n && typeof n.id === "string" && Number.isFinite(n.distance) && n.distance >= 0);
    entries[id] = { palette, color: valid(entry.color), visual: valid(entry.visual) };
  }
  return entries;
}

function Swatches({ palette }: { palette: PaletteColor[] }) {
  return <div className="similarity-swatches" aria-label="Extracted palette">
    {palette.map((color, index) => <span key={`${color.hex}-${index}`} role="img"
      aria-label={`${color.hex}, ${Math.round(color.weight * 100)}% of visible color`}
      title={`${color.hex} · ${Math.round(color.weight * 100)}% of visible color`}
      style={{ backgroundColor: color.hex, flexGrow: color.weight }} />)}
  </div>;
}

export default function SimilarityPanel({ query, emojis, selectedEmojis, onToggleSelection, onClose }: {
  query: EmojiMetadata;
  emojis: EmojiMetadata[];
  selectedEmojis: EmojiMetadata[];
  onToggleSelection: (emoji: EmojiMetadata) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Record<string, SimilarityEntry> | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"color" | "visual">("color");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [query.id]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/similarity/index.json", { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Index unavailable");
      return response.json();
    }).then((data) => { if (!controller.signal.aborted) setEntries(parseEntries(data)); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  const byId = useMemo(() => new Map(emojis.map((emoji) => [emoji.id, emoji])), [emojis]);
  const entry = entries?.[query.id];
  const seen = new Set([query.id]);
  const neighbors = (entry?.[mode] ?? []).flatMap((neighbor) => {
    const emoji = byId.get(neighbor.id);
    if (!emoji || seen.has(emoji.id)) return [];
    seen.add(emoji.id);
    return [emoji];
  }).slice(0, 12);
  return <section className="similarity-panel" aria-labelledby="similarity-heading"
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="similarity-header">
      <div><h2 id="similarity-heading" ref={heading} tabIndex={-1}>Similar to {query.filename}</h2>
        <p>Compare appearance, then add matches to your sheet.</p></div>
      <button type="button" onClick={onClose}>Close similarity</button>
    </div>
    <div className="similarity-query"><img src={stillSrc(query)} alt={query.filename} width="64" height="64" />
      {entry && <Swatches palette={entry.palette} />}</div>
    <div className="similarity-modes" role="group" aria-label="Similarity mode">
      <button type="button" aria-pressed={mode === "color"} onClick={() => setMode("color")}>Similar colors</button>
      <button type="button" aria-pressed={mode === "visual"} onClick={() => setMode("visual")}>Looks similar</button>
    </div>
    <p className="similarity-note">{mode === "color" ? "Nearby shades and their proportions." : "Color placement, outlines, and internal details."} Appearance matches do not imply the same meaning.</p>
    <div role="status">{failed || (entries && !entry) ? "Similarity is unavailable for this emoji. You can still browse and select below."
      : !entries ? "Loading similarity…" : neighbors.length === 0 ? "No close matches in this collection yet." : `${neighbors.length} appearance matches`}</div>
    <ul className="similarity-results">
      {neighbors.map((emoji) => <li key={emoji.id}>
        <button type="button" className={`emoji-card ${selectedEmojis.some((e) => e.id === emoji.id) ? "emoji-card-selected" : ""}`}
          aria-label={`Select ${emoji.filename}`} aria-pressed={selectedEmojis.some((e) => e.id === emoji.id)} onClick={() => onToggleSelection(emoji)}>
          <div className="emoji-card-preview"><img className="emoji-card-image" src={stillSrc(emoji)} alt={emoji.filename} loading="lazy" /></div>
          <span className="emoji-card-name">{emoji.filename}</span>
        </button>
        {entries?.[emoji.id] && <Swatches palette={entries[emoji.id].palette} />}
      </li>)}
    </ul>
  </section>;
}
