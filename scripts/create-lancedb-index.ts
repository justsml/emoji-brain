import * as lancedb from "@lancedb/lancedb";
import "@lancedb/lancedb/embedding/openai";
import { LanceSchema, getRegistry, register } from "@lancedb/lancedb/embedding";
import { EmbeddingFunction } from "@lancedb/lancedb/embedding";
import { type Float, Float32, Utf8 } from "apache-arrow";

const INCLUDE_OUTPUT_IN_GIT = process.env.INCLUDE_OUTPUT_IN_GIT !== "false";
const uri = INCLUDE_OUTPUT_IN_GIT
  ? "public/lancedb-emojis"
  : "dist/lancedb-emojis";

const db = await lancedb.connect(uri);
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

// const db = await lancedb.connect(uri);
