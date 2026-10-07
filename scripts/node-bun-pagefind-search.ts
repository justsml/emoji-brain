#!/usr/bin/env bun
// @ts-ignore
globalThis.document = {};
// @ts-ignore
globalThis.window ||= {};

// @ts-ignore
globalThis.location = {
  origin: "https://adorbs.fun/",
  pathname: "/",
  // @ts-ignore
  search: "",
  hash: "",
  href: "https://adorbs.fun/",
};
const pagefind = await import("../public/pagefind/pagefind.js");

pagefind.init({
  baseUrl: "https://adorbs.fun/",
})

const search = await pagefind.search("meow");

for await (const result of search.results) {
  console.log(await result.data());
}

// console.log(search);
