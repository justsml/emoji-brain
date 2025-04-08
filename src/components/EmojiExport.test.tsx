import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmojiExport } from "./EmojiExport";
import { render } from "../test-utils/test-utils";
import type { EmojiMetadata } from "../types/emoji";

// Mock the JSZip import
vi.mock("jszip", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      file: vi.fn(),
      generateAsync: vi.fn().mockResolvedValue(new Blob()),
    })),
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

    // Mock clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });

    // Mock fetch for ZIP download
    global.fetch = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(new Blob()),
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    URL.createObjectURL = vi.fn().mockReturnValue("mock-url");
    URL.revokeObjectURL = vi.fn();

    // Mock document.createElement and related methods for download
    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };

    document.createElement = vi.fn().mockImplementation((tag) => {
      if (tag === "a") return mockAnchor;
      return {};
    });

    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
  });

  it("renders with the correct number of selected emojis", () => {
    render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: mockSelectedEmojis,
          focusedIndex: -1,
        },
      },
    });

    expect(screen.getByText("2 emojis selected")).toBeInTheDocument();
  });

  it("renders with singular text when only one emoji is selected", () => {
    render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: [mockSelectedEmojis[0]],
          focusedIndex: -1,
        },
      },
    });

    expect(screen.getByText("1 emoji selected")).toBeInTheDocument();
  });

  it("shows export dropdown when clicking the Export As button", async () => {
    render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: mockSelectedEmojis,
          focusedIndex: -1,
        },
      },
    });

    const exportButton = screen.getByText("Export As...");
    await userEvent.click(exportButton);

    expect(screen.getByText("Plain Text")).toBeInTheDocument();
    expect(screen.getByText("HTML")).toBeInTheDocument();
    expect(screen.getByText("CSS")).toBeInTheDocument();
    expect(screen.getByText("ZIP File")).toBeInTheDocument();
  });

  it("calls clipboard API when exporting as plain text", async () => {
    render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: mockSelectedEmojis,
          focusedIndex: -1,
        },
      },
    });

    const exportButton = screen.getByText("Export As...");
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
    render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: mockSelectedEmojis,
          focusedIndex: -1,
        },
      },
    });

    const exportButton = screen.getByText("Export As...");
    await userEvent.click(exportButton);

    const htmlOption = screen.getByText("HTML");
    await userEvent.click(htmlOption);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '<img src="/emojis/emoji1.png" alt="emoji1.png" />\n<img src="/emojis/emoji2.png" alt="emoji2.png" />'
    );
    expect(screen.getByText("Copied HTML to clipboard!")).toBeInTheDocument();
  });

  it("calls clipboard API when exporting as CSS", async () => {
    render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: mockSelectedEmojis,
          focusedIndex: -1,
        },
      },
    });

    const exportButton = screen.getByText("Export As...");
    await userEvent.click(exportButton);

    const cssOption = screen.getByText("CSS");
    await userEvent.click(cssOption);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(".emoji-1")
    );
    expect(screen.getByText("Copied CSS to clipboard!")).toBeInTheDocument();
  });

  it("creates a ZIP file when exporting as ZIP", async () => {
    render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: mockSelectedEmojis,
          focusedIndex: -1,
        },
      },
    });

    const exportButton = screen.getByText("Export As...");
    await userEvent.click(exportButton);

    const zipOption = screen.getByText("ZIP File");
    await userEvent.click(zipOption);

    // Wait for async operations
    await vi.waitFor(() => {
      expect(screen.getByText("ZIP downloaded!")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(document.createElement).toHaveBeenCalledWith("a");
  });

  it("dispatches resetSelection when clicking Clear Selection", async () => {
    const { store } = render(<EmojiExport />, {
      initialState: {
        selection: {
          selectedEmojis: mockSelectedEmojis,
          focusedIndex: -1,
        },
      },
    });

    const clearButton = screen.getByText("Clear Selection");
    await userEvent.click(clearButton);

    const state = store.getState();
    expect(state.selection.selectedEmojis).toHaveLength(0);
  });
});
