import { describe, expect, it } from "vitest";
import { buildShareUrl, packIds, readShareParams, unpackIds } from "./shareLink";

describe("shareLink", () => {
  it("packs hex ids compactly and round-trips them in order", () => {
    const ids = ["df167e0a", "00000001", "ffffffff", "0a0b0c0d"];
    const packed = packIds(ids);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(packed.length).toBeLessThan(ids.join(",").length);
    expect(unpackIds(packed)).toEqual(ids);
  });

  it("falls back to a plain list for non-hex ids", () => {
    const ids = ["1", "two", "a,b"];
    expect(unpackIds(packIds(ids))).toEqual(ids);
  });

  it("returns nothing for garbage", () => {
    expect(unpackIds("")).toEqual([]);
    expect(unpackIds("not base64!")).toEqual([]);
    expect(unpackIds("abc")).toEqual([]);
  });

  it("builds and reads a URL with a search and a selection", () => {
    const url = buildShareUrl({ q: " cat ", ids: ["df167e0a"] }, "https://example.test/");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("cat");
    expect(readShareParams(parsed.search)).toEqual({ q: "cat", ids: ["df167e0a"] });
    expect(buildShareUrl({}, "https://example.test/")).toBe("https://example.test/");
    expect(readShareParams("?s=")).toEqual({ q: undefined, ids: undefined });
  });
});
