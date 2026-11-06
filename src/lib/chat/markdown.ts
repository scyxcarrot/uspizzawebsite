// A tiny, safe Markdown parser for chat replies. It produces plain data
// (no HTML strings), which the chat widget turns into React elements, so the
// model can never inject HTML or scripts.
//
// Supported: paragraphs, "- " / "* " bullets, "1. " numbered lists,
// **bold**, *italic*, `code`, [text](url) links and bare https URLs.
// Links must be https, or one of our own pages (e.g. /checkout).

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string; internal: boolean };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const INTERNAL_LINK = /^\/(checkout|track|order\/US-\d{4})?$/;

/** Returns a safe href, or null if the link is not allowed. */
export function safeHref(raw: string): { href: string; internal: boolean } | null {
  const href = raw.trim();
  if (INTERNAL_LINK.test(href)) return { href, internal: true };
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    return { href: url.toString(), internal: false };
  } catch {
    return null;
  }
}

const INLINE_PATTERN =
  /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)|\*\*([^*\n]+?)\*\*|`([^`\n]+)`|(?<![*\w])\*([^*\n]+?)\*(?!\w)|(https:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_PATTERN)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: "text", text: text.slice(last, index) });
    if (m[1] !== undefined && m[2] !== undefined) {
      const safe = safeHref(m[2]);
      out.push(safe ? { type: "link", text: m[1], ...safe } : { type: "text", text: m[1] });
    } else if (m[3] !== undefined) {
      out.push({ type: "bold", children: parseInline(m[3]) });
    } else if (m[4] !== undefined) {
      out.push({ type: "code", text: m[4] });
    } else if (m[5] !== undefined) {
      out.push({ type: "italic", children: parseInline(m[5]) });
    } else if (m[6] !== undefined) {
      const safe = safeHref(m[6]);
      out.push(safe ? { type: "link", text: m[6], ...safe } : { type: "text", text: m[6] });
    }
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };

  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    // Strip heading markers rather than rendering headings.
    const line = rawLine.replace(/^#{1,6}\s+/, "");
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]!);
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
