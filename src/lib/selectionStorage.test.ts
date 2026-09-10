import { describe, expect, it } from "vitest";
import type { EmojiMetadata } from "../types/emoji";
import { reconcileSelection } from "./selectionStorage";

function emoji(overrides: Partial<EmojiMetadata> & { id: string; filename: string }): EmojiMetadata {
  return {
    path: `/emojis/${overrides.filename}`,
    categories: [],
    tags: [],
    size: 100,
    ...overrides,
  };
}

const catalog: EmojiMetadata[] = [
  emoji({ id: "c6bf7ef8", filename: "meow_angrypats.webp", aliases: ["meow-angrypats"] }),
  emoji({ id: "df167e0a", filename: "10-10.webp" }),
];

describe("reconcileSelection", () => {
  it("returns nothing for an empty or malformed store", () => {
    expect(reconcileSelection([], catalog)).toEqual([]);
    expect(reconcileSelection(null, catalog)).toEqual([]);
    expect(reconcileSelection("meow_angrypats.webp", catalog)).toEqual([]);
  });

  it("rebuilds a selection from stored ids, in order", () => {
    expect(reconcileSelection(["df167e0a", "c6bf7ef8"], catalog).map((e) => e.filename)).toEqual([
      "10-10.webp",
      "meow_angrypats.webp",
    ]);
  });

  it("drops ids that no longer exist after a dedupe", () => {
    expect(reconcileSelection(["c6bf7ef8", "deadbeef"], catalog).map((e) => e.id)).toEqual(["c6bf7ef8"]);
  });

  it("refreshes legacy stored records against the current catalog", () => {
    const stale = [{ id: "c6bf7ef8", filename: "meow-angrypats.webp", path: "/emojis/meow-angrypats.webp" }];
    expect(reconcileSelection(stale, catalog)).toEqual([catalog[0]]);
  });

  it("recovers a deduped record through the surviving emoji's alias", () => {
    const stale = [{ id: "00000000", filename: "meow-angrypats.webp", path: "/emojis/meow-angrypats.webp" }];
    expect(reconcileSelection(stale, catalog)).toEqual([catalog[0]]);
  });

  it("collapses duplicates that now resolve to the same emoji", () => {
    const stale = [
      { id: "c6bf7ef8", filename: "meow_angrypats.webp" },
      { id: "00000000", filename: "meow-angrypats.webp" },
    ];
    expect(reconcileSelection(stale, catalog)).toEqual([catalog[0]]);
  });
});
