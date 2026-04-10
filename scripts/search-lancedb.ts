import * as lancedb from "@lancedb/lancedb";
import "@lancedb/lancedb/embedding/openai";
// import { LanceSchema, getRegistry, register } from "@lancedb/lancedb/embedding";
// import { EmbeddingFunction } from "@lancedb/lancedb/embedding";
// import { type Float, Float32, Utf8 } from "apache-arrow";

const INCLUDE_OUTPUT_IN_GIT = process.env.INCLUDE_OUTPUT_IN_GIT !== "false";
const uri = INCLUDE_OUTPUT_IN_GIT
  ? "public/lancedb-emojis"
  : "dist/lancedb-emojis";
const db = await lancedb.connect(uri);

import data from "../src/data/emoji-metadata.json" assert { type: "json" };
import { statSync } from "node:fs";
import { basename } from "node:path";

const emojis = data.emojis.map((emoji) => {
  const fileStat = statSync("public" + emoji.path);
  const createdDate = fileStat.birthtime || fileStat.mtime;
  const created = createdDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD
  const fileBaseName = basename(emoji.path);
  const labels = new Set(
    [
      emoji.filename,
      ...emoji.categories,
      ...emoji.tags,
      ...getRelatedTags(emoji.path),
    ].map((entry) => entry.toLowerCase())
  ).entries();

  return {
    id: emoji.id,
    // language: "en",
    url: emoji.path,
    text: labels.toArray().join(", "),
    filename: emoji.filename,
    size: `${emoji.size}`,
    path: emoji.path,
    created,
    categories: emoji.categories,
    fileBaseName,
  };
});

const tbl = await db.createTable("emoji_list", emojis, { mode: "overwrite" });

await tbl.createIndex("text", {
  config: lancedb.Index.fts(),
});
await tbl.createIndex("id");
await tbl.createIndex("created", { config: lancedb.Index.bitmap() });

const results = await tbl
  .search("meow", "fts")
  .select(["text", "url", "_score"])
  .limit(50)
  .toArray();

console.log("Search results:", results.length, results);

function getRelatedTags(url: string) {
  if (url.includes("meow")) return ["cat", "kitten", "animal"];
  if (url.includes("cat")) return ["meow", "kitten", "animal"];
  if (url.includes("dog")) return ["dog", "animal"];
  if (url.includes("roo")) return ["animal", "panda"];
  return [];
}
