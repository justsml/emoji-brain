import * as pagefind from "pagefind";
import data from "../src/data/emoji-metadata.json" assert { type: "json" };
import { statSync } from "node:fs";

const { index } = await pagefind.createIndex();

// Add the emoji metadata to the index
for (const emoji of data.emojis) {
  const labels = [...emoji.categories, ...emoji.tags, ...getRelatedTags(emoji.path)];
  const fileStat = statSync('public' + emoji.path);
  const createdDate = fileStat.birthtime || fileStat.mtime;
  const created = createdDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD


  await index!.addCustomRecord({
    language: "en",
    url: emoji.path,
    content: labels.join(", "),
    meta: {
      id: emoji.id,
      size: `${emoji.size}`,
      filename: emoji.filename,
      created,
    }
  });
}

function getRelatedTags(url: string) {
  if (url.includes("meow")) return ["cat", "kitten", "animal"];
  if (url.includes("cat")) return ["meow", "kitten", "animal"];
  if (url.includes("dog")) return ["dog", "animal"];
  if (url.includes("root")) return ["animal", "panda"];
  return [];
}

// write the index to disk
await index!.writeFiles({
  outputPath: "public/pagefind"
});

