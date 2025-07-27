#!/usr/bin/env bun
// @ts-ignore
globalThis.document = {};
// @ts-ignore
globalThis.window ||= {};

// @ts-ignore
globalThis.location = {
  origin: "https://emoji-brain.netlify.app/",
  pathname: "/",
  // @ts-ignore
  search: "",
  hash: "",
  href: "https://emoji-brain.netlify.app/",
};
const pagefind = await import("../public/pagefind/pagefind.js");

pagefind.init({
  baseUrl: "https://emoji-brain.netlify.app/",
})

const search = await pagefind.search("meow");

for await (const result of search.results) {
  console.log(await result.data());
}

// console.log(search);
