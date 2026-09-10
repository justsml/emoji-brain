import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SimilarityPanel from "./SimilarityPanel";
import type { EmojiMetadata } from "../types/emoji";

const emojis: EmojiMetadata[] = ["a", "b", "c"].map((id) => ({ id, filename: `${id}.png`, path: `/emojis/${id}.png`, tags: [], categories: [], created: "", size: 1 }));
const palette = [{ hex: "#ff0000", weight: 1, lab: [0.6, 0.2, 0.1] }];
const neighbor = (id: string) => ({ id, distance: .1 });
const data = { entries: { a: { palette, color: [neighbor("a"), neighbor("missing"), neighbor("b"), neighbor("b")], visual: [neighbor("c")] }, b: { palette, color: [], visual: [] }, c: { palette, color: [], visual: [] } } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
  const onToggleSelection = vi.fn(); const onClose = vi.fn();
  render(<SimilarityPanel query={emojis[0]} emojis={emojis} selectedEmojis={[emojis[1]]} onToggleSelection={onToggleSelection} onClose={onClose} />);
  return { onToggleSelection, onClose };
}
describe("similarity browsing", () => {
  it("shows known unique neighbors, palette proportions, separate modes and selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
    const user = userEvent.setup(); const { onToggleSelection, onClose } = setup();
    const selected = await screen.findByRole("button", { name: "Select b.png" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Select / })).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: /100% of visible color/ })).toHaveLength(2);
    await user.click(selected); expect(onToggleSelection).toHaveBeenCalledWith(emojis[1]);
    await user.click(screen.getByRole("button", { name: "Looks similar" }));
    expect(screen.getByRole("button", { name: "Select c.png" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Select b.png" })).toBeNull();
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalledOnce();
  });
  it("announces loading and focuses the query heading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); setup();
    expect(screen.getByRole("status")).toHaveTextContent("Loading similarity");
    expect(screen.getByRole("heading")).toHaveFocus();
  });
  it.each([null, { entries: [] }, { entries: {} }])("handles malformed or missing data %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body })); setup();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("unavailable"));
  });
  it("handles unavailable requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline"))); setup();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("unavailable"));
  });
  it("allows empty results without padding weak matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: { a: { palette: [], color: [], visual: [] } } }) })); setup();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No close matches"));
  });
});
