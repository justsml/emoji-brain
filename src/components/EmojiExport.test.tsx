import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { EmojiExport } from "./EmojiExport";
import { render } from "../test-utils/test-utils";
import type { EmojiMetadata } from "../types/emoji";

vi.mock("jszip", () => {
  function JSZipMock() {
    this.file = vi.fn();
    this.generateAsync = vi.fn().mockResolvedValue(new Blob());
  }
  return {
    default: JSZipMock,
  };
});

describe("EmojiExport Component", () => {
  const mockSelectedEmojis: EmojiMetadata[] = [
    {
      id: "1",
      filename: "emoji1.png",
      path: "/emojis/emoji1.png",
      categories: ["cat"],
      tags: ["funny"],
      created: "2023-01-01",
      size: 1024,
    },
    {
      id: "2",
      filename: "emoji2.png",
      path: "/emojis/emoji2.png",
      categories: ["dog"],
      tags: ["cute"],
      created: "2023-01-02",
      size: 2048,
    },
  ];

  const renderExport = (overrides: Partial<ComponentProps<typeof EmojiExport>> = {}) =>
    render(
      <EmojiExport
        selectedEmojis={mockSelectedEmojis}
        onClearSelection={vi.fn()}
        onDeselectVisible={vi.fn()}
        onSelectAll={vi.fn()}
        filteredEmojis={mockSelectedEmojis}
        gridScale={1}
        onRemoveEmoji={vi.fn()}
        {...overrides}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" })),
    });

    URL.createObjectURL = vi.fn().mockReturnValue("mock-url");
    URL.revokeObjectURL = vi.fn();

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };

    const originalCreateElement = document.createElement.bind(document);
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);

    document.createElement = vi.fn().mockImplementation((tag) => {
      if (tag === "a") return mockAnchor;
      return originalCreateElement(tag);
    });

    document.body.appendChild = vi.fn().mockImplementation((el) => {
      if (el === mockAnchor) return mockAnchor as any;
      return originalAppendChild(el);
    });

    document.body.removeChild = vi.fn().mockImplementation((el) => {
      if (el === mockAnchor) return mockAnchor as any;
      return originalRemoveChild(el);
    });
  });

  it("renders with the correct number of selected emojis", () => {
    renderExport();

    expect(screen.getByLabelText("2 selected")).toBeInTheDocument();
  });

  it("renders with singular text when only one emoji is selected", () => {
    renderExport({ selectedEmojis: [mockSelectedEmojis[0]] });

    expect(screen.getByLabelText("1 selected")).toBeInTheDocument();
  });

  it("shows export dropdown when clicking the Export button", async () => {
    renderExport();

    const exportButton = screen.getByRole("button", { name: "Other export options" });
    await userEvent.click(exportButton);

    expect(screen.getByText("Plain Text")).toBeInTheDocument();
    expect(screen.getByText("HTML")).toBeInTheDocument();
    expect(screen.getByText("CSS")).toBeInTheDocument();
    expect(screen.getByText("ZIP File")).toBeInTheDocument();
  });

  it("calls clipboard API when exporting as plain text", async () => {
    renderExport();

    const exportButton = screen.getByRole("button", { name: "Other export options" });
    await userEvent.click(exportButton);

    const plainTextOption = screen.getByText("Plain Text");
    await userEvent.click(plainTextOption);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "emoji1.png\nemoji2.png"
    );
    expect(
      screen.getByText("Copied filenames to clipboard!")
    ).toBeInTheDocument();
  });

  it("calls clipboard API when exporting as HTML", async () => {
    renderExport();

    const exportButton = screen.getByRole("button", { name: "Other export options" });
    await userEvent.click(exportButton);

    const htmlOption = screen.getByText("HTML");
    await userEvent.click(htmlOption);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '<img src="http://localhost:3000/emojis/emoji1.png" alt="emoji1.png" />\n<img src="http://localhost:3000/emojis/emoji2.png" alt="emoji2.png" />'
    );
    expect(screen.getByText("Copied HTML to clipboard!")).toBeInTheDocument();
  });

  it("calls clipboard API when exporting as CSS", async () => {
    renderExport();

    const exportButton = screen.getByRole("button", { name: "Other export options" });
    await userEvent.click(exportButton);

    const cssOption = screen.getByText("CSS");
    await userEvent.click(cssOption);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(".emoji-1")
    );
    expect(screen.getByText("Copied CSS to clipboard!")).toBeInTheDocument();
  });

  it("creates a ZIP file when exporting as ZIP", async () => {
    renderExport();

    const exportButton = screen.getByRole("button", { name: "Other export options" });
    await userEvent.click(exportButton);

    const zipOption = screen.getByText("ZIP File");
    await userEvent.click(zipOption);

    await vi.waitFor(() => {
      expect(screen.getByText("ZIP downloaded!")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("copies a self-contained Slack upload script", async () => {
    renderExport();

    await userEvent.click(screen.getByRole("button", { name: "Copy Slack script" }));

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/api/emoji.add")
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("emoji1.png")
    );
    const script = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    const megabytes = (new Blob([script]).size / 1_000_000).toFixed(3);
    expect(screen.getByRole("status")).toHaveTextContent(`Copied Slack script · ${megabytes} MB`);
    expect(screen.getByRole("region", { name: "Three steps to get them into Slack" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close Slack instructions" }));
    expect(screen.queryByRole("region", { name: "Three steps to get them into Slack" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Slack script" })).toHaveFocus();
  });

  it("disables export actions with no selection", () => {
    renderExport({ selectedEmojis: [] });
    expect(screen.getByRole("button", { name: "Copy Slack script" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Other export options" })).toBeDisabled();
  });

  it("does not show instructions when clipboard copying fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Clipboard unavailable"));
    renderExport();
    await userEvent.click(screen.getByRole("button", { name: "Copy Slack script" }));
    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not copy the Slack script"));
    expect(screen.queryByRole("region", { name: "Three steps to get them into Slack" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Slack script" })).toBeEnabled();
    consoleError.mockRestore();
  });

  it("separates deselecting visible emojis from clearing the full selection", async () => {
    const mockClear = vi.fn();
    const mockDeselectVisible = vi.fn();
    renderExport({ onClearSelection: mockClear, onDeselectVisible: mockDeselectVisible });

    await userEvent.click(screen.getByRole("button", { name: "Deselect visible" }));
    expect(mockDeselectVisible).toHaveBeenCalledOnce();
    expect(mockClear).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Clear all selected emojis" }));
    expect(mockClear).toHaveBeenCalledOnce();
  });
});
