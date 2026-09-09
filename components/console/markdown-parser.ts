/**
 * A deliberately tiny markdown subset: bold, inline code, links, bullet and ordered lists, paragraphs.
 * It produces a node tree, never HTML — the console has no dangerouslySetInnerHTML anywhere, so a model
 * that emits a <script> tag can only ever produce literal text.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

export type Block =
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

/** Only http(s) and mailto survive; everything else (javascript:, data:) is rendered as plain text. */
export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return null;
}

const INLINE_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let index = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index;
    if (start > index) nodes.push({ type: "text", value: text.slice(index, start) });
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = safeHref(match[2]);
      nodes.push(href ? { type: "link", value: match[1], href } : { type: "text", value: match[0] });
    } else if (match[3] !== undefined) {
      nodes.push({ type: "bold", value: match[3] });
    } else if (match[4] !== undefined) {
      nodes.push({ type: "code", value: match[4] });
    }
    index = start + match[0].length;
  }
  if (index < text.length) nodes.push({ type: "text", value: text.slice(index) });
  if (nodes.length === 0) return [{ type: "text", value: text }];
  // A rejected link leaves two adjacent text nodes; merge them so the output is canonical.
  const merged: Inline[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node.type === "text" && previous?.type === "text") previous.value += node.value;
    else merged.push(node);
  }
  return merged;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const line of source.split("\n")) {
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = ordered !== null;
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(parseInline((bullet?.[1] ?? ordered?.[1]) ?? ""));
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}
