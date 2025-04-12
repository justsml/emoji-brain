import Fuse from "fuse.js";
import data from "../src/data/emoji-metadata.json" assert { type: "json" };
import fs from "node:fs";

const emojieData = data.emojis.map((emoji) => ({
  id: emoji.id,
  size: emoji.size,
  url: emoji.path,
  content: [
    ...emoji.categories,
    ...emoji.tags,
    ...getRelatedTags(emoji.path),
  ].join(", "),
  created: emoji.created,
}));

const emojiIndex = Fuse.createIndex(["url", "content"], emojieData);
// Serialize and save it
fs.writeFileSync(
  "./public/fuse-index.json",
  JSON.stringify(emojiIndex.toJSON()),
  "utf-8"

);

function getRelatedTags(url: string) {
  if (url.includes("meow")) return ["cat", "kitten", "animal"];
  if (url.includes("cat")) return ["meow", "kitten", "animal"];
  if (url.includes("dog")) return ["dog", "animal"];
  if (url.includes("roo")) return ["animal", "panda"];
  return [];
}
