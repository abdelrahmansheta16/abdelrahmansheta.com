/** The transcript renderer must never be able to emit raw HTML or a javascript: link. */
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "@/components/console/markdown-parser";

describe("safeHref", () => {
  it("allows http, https, mailto and site-relative paths", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(safeHref("/cv.pdf")).toBe("/cv.pdf");
  });

  it("rejects javascript:, data: and protocol-relative URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
  });
});

describe("parseInline", () => {
  it("parses bold, code and links", () => {
    expect(parseInline("a **b** `c` [d](https://e.com)")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "b" },
      { type: "text", value: " " },
      { type: "code", value: "c" },
      { type: "text", value: " " },
      { type: "link", value: "d", href: "https://e.com" },
    ]);
  });

  it("degrades an unsafe link to literal text", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ type: "text", value: "[x](javascript:alert(1))" }]);
  });

  it("keeps HTML as text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { type: "text", value: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("splits paragraphs and lists", () => {
    const blocks = parseMarkdown("Intro line\n\n- one\n- two\n\n1. first\n2. second");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "list"]);
    expect(blocks[1]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: true });
  });

  it("returns nothing for empty input", () => {
    expect(parseMarkdown("   \n\n")).toEqual([]);
  });
});
