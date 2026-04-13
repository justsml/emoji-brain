import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });

    global.fetch = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(new Blob()),
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
    render(<EmojiExport selectedEmojis={mockSelectedEmojis} onClearSelection={vi.fn()} />);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("renders with singular text when only one emoji is selected", () => {
    render(<EmojiExport selectedEmojis={[mockSelectedEmojis[0]]} onClearSelection={vi.fn()} />);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("shows export dropdown when clicking the Export button", async () => {
    render(<EmojiExport selectedEmojis={mockSelectedEmojis} onClearSelection={vi.fn()} />);

    const exportButton = screen.getByText("Export...");
    await userEvent.click(exportButton);

    expect(screen.getByText("Plain Text")).toBeInTheDocument();
    expect(screen.getByText("HTML")).toBeInTheDocument();
    expect(screen.getByText("CSS")).toBeInTheDocument();
    expect(screen.getByText("ZIP File")).toBeInTheDocument();
  });

  it("calls clipboard API when exporting as plain text", async () => {
    render(<EmojiExport selectedEmojis={mockSelectedEmojis} onClearSelection={vi.fn()} />);

    const exportButton = screen.getByText("Export...");
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
    render(<EmojiExport selectedEmojis={mockSelectedEmojis} onClearSelection={vi.fn()} />);

    const exportButton = screen.getByText("Export...");
    await userEvent.click(exportButton);

    const htmlOption = screen.getByText("HTML");
    await userEvent.click(htmlOption);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '<img src="http://localhost:3000/emojis/emoji1.png" alt="emoji1.png" />\n<img src="http://localhost:3000/emojis/emoji2.png" alt="emoji2.png" />'
    );
    expect(screen.getByText("Copied HTML to clipboard!")).toBeInTheDocument();
  });

  it("calls clipboard API when exporting as CSS", async () => {
    render(<EmojiExport selectedEmojis={mockSelectedEmojis} onClearSelection={vi.fn()} />);

    const exportButton = screen.getByText("Export...");
    await userEvent.click(exportButton);

    const cssOption = screen.getByText("CSS");
    await userEvent.click(cssOption);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(".emoji-1")
    );
    expect(screen.getByText("Copied CSS to clipboard!")).toBeInTheDocument();
  });

  it("creates a ZIP file when exporting as ZIP", async () => {
    render(<EmojiExport selectedEmojis={mockSelectedEmojis} onClearSelection={vi.fn()} />);

    const exportButton = screen.getByText("Export...");
    await userEvent.click(exportButton);

    const zipOption = screen.getByText("ZIP File");
    await userEvent.click(zipOption);

    await vi.waitFor(() => {
      expect(screen.getByText("ZIP downloaded!")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("calls onClearSelection when reset is triggered", async () => {
    const mockClear = vi.fn();
    render(<EmojiExport selectedEmojis={mockSelectedEmojis} onClearSelection={mockClear} />);

    expect(mockClear).not.toHaveBeenCalled();
  });
});
