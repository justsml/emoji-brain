import * as pagefind from "pagefind";
import data from "../src/data/emoji-metadata.json" assert { type: "json" };

// Create a Pagefind search index to work with
const { index } = await pagefind.createIndex();

// Add the emoji metadata to the index
for (const emoji of data.emojis) {
  // Add the emoji to the index
  await index!.addCustomRecord({
    url: emoji.path,
    content: emoji.categories.join(", ") + emoji.tags.join(", "),
    language: "en",
    // meta: {
    //   title: emoji.
    // }
  });
  // index.add({
  //   id: emoji.unified,
  //   title: emoji.unified,
  //   content: emoji.description,
  //   tags: emoji.tags,
  //   categories: emoji.categories,
  // });
}


// Or, write the index to disk
await index!.writeFiles({
  outputPath: "public/pagefind"
});

