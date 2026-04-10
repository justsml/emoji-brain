import * as lancedb from "@lancedb/lancedb";
import "@lancedb/lancedb/embedding/openai";
import { LanceSchema, getRegistry, register } from "@lancedb/lancedb/embedding";
import { EmbeddingFunction } from "@lancedb/lancedb/embedding";
import { type Float, Float32, Utf8 } from "apache-arrow";

const INCLUDE_OUTPUT_IN_GIT = process.env.INCLUDE_OUTPUT_IN_GIT !== "false";
const uri = INCLUDE_OUTPUT_IN_GIT
  ? "public/lancedb-emojis"
  : "dist/lancedb-emojis";
const databaseDir = "dist/lancedb-emojis";
const db = await lancedb.connect(databaseDir);
const func = getRegistry()
  .get("openai")
  ?.create({ model: "text-embedding-ada-002" }) as EmbeddingFunction;

const wordsSchema = LanceSchema({
  text: func.sourceField(new Utf8()),
  vector: func.vectorField(),
});
const tbl = await db.createEmptyTable("words", wordsSchema, {
  mode: "overwrite",
});
await tbl.add([{ text: "hello world" }, { text: "goodbye world" }]);

const query = "greetings";
const actual = (await tbl.search(query).limit(1).toArray())[0];

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
    text: labels.join(", "),
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

// // Add the emoji metadata to the index
// for (const emoji of data.emojis) {
//   const labels = [...emoji.categories, ...emoji.tags, ...getRelatedTags(emoji.path)];
//   const fileStat = statSync('public' + emoji.path);
//   const createdDate = fileStat.birthtime || fileStat.mtime;
//   const created = createdDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD
//   const fileBaseName = basename(emoji.path);

//   // await index!.addCustomRecord({
//   //   sort: {
//   //     created: created,
//   //     filename: emoji.filename,
//   //   },

//   //   language: "en",
//   //   url: emoji.path,
//   //   content: labels.join(", "),
//   //   meta: {
//   //     id: emoji.id,
//   //     size: `${emoji.size}`,
//   //     filename: emoji.filename,
//   //     fileBaseName,
//   //     path: emoji.path,
//   //     created,
//   //   }
//   // });
// }

function getRelatedTags(url: string) {
  if (url.includes("meow")) return ["cat", "kitten", "animal"];
  if (url.includes("cat")) return ["meow", "kitten", "animal"];
  if (url.includes("dog")) return ["dog", "animal"];
  if (url.includes("roo")) return ["animal", "panda"];
  return [];
}
