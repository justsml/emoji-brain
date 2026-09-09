import { promises as fs } from "node:fs";
import * as pagefind from "pagefind";
import data from "../src/data/emoji-metadata.json" with { type: "json" };
import { basename } from "node:path";

const { index, errors } = await pagefind.createIndex();
if (!index || errors.length) throw new Error(`Pagefind initialization failed: ${errors.join(", ")}`);

// Add the emoji metadata to the index
for (const emoji of data.emojis) {
  const labels = [...emoji.categories, ...emoji.tags, ...((emoji as { aliases?: string[] }).aliases ?? []), ...getRelatedTags(emoji.path)];
  const created = emoji.created.split("T")[0];
  const fileBaseName = basename(emoji.path);

  const result = await index.addCustomRecord({
    sort: {
      created: created,
      filename: emoji.filename,
    },

    language: "en",
    url: emoji.path,
    content: labels.join(", "),
    meta: {
      id: emoji.id,
      size: `${emoji.size}`,
      filename: emoji.filename,
      fileBaseName,
      path: emoji.path,
      created,
    }
  });
  if (result.errors.length) throw new Error(result.errors.join("; "));
}

function getRelatedTags(url: string) {
  if (url.includes("meow")) return ["cat", "kitten", "animal"];
  if (url.includes("cat")) return ["meow", "kitten", "animal"];
  if (url.includes("dog")) return ["dog", "animal"];
  if (url.includes("roo")) return ["animal", "panda"];
  return [];
}

// write the index to disk
const staging = await fs.mkdtemp("public/.pagefind-");
try {
  const written = await index.writeFiles({ outputPath: staging });
  if (written.errors.length) throw new Error(written.errors.join("; "));
  await fs.rm("public/pagefind", { recursive: true, force: true });
  await fs.rename(staging, "public/pagefind");
} finally {
  await fs.rm(staging, { recursive: true, force: true });
  await pagefind.close();
}
