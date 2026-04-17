import { Fragment, ReactNode } from "react";

/**
 * Minimal, safe markdown renderer for chat bubbles.
 * Supports: **bold**, *italic*, `code`, [links](url), - lists, 1. lists, ### headings.
 * No HTML is ever injected as-is — everything becomes React elements.
 */
export function renderMarkdown(text: string): ReactNode {
  const blocks = splitIntoBlocks(text);
  return (
    <>
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block, i)}</Fragment>
      ))}
    </>
  );
}

type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function splitIntoBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Heading: #, ##, ###
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+[\.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[\.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[\.)]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph — group consecutive non-empty non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[\.)]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) blocks.push({ kind: "paragraph", lines: paraLines });
  }

  return blocks;
}

function renderBlock(block: Block, blockIdx: number): ReactNode {
  switch (block.kind) {
    case "heading": {
      const common = "font-bold text-on-surface leading-tight";
      const sizes = { 1: "text-sm mt-2 mb-1", 2: "text-xs mt-2 mb-1", 3: "text-xs mt-1.5 mb-0.5" };
      return <div className={`${common} ${sizes[block.level]}`}>{renderInline(block.text)}</div>;
    }
    case "ul":
      return (
        <ul className="list-disc list-outside ml-4 my-1 space-y-0.5">
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal list-outside ml-4 my-1 space-y-0.5">
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "paragraph":
      return (
        <p className={blockIdx === 0 ? "" : "mt-1.5"}>
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {renderInline(line)}
            </Fragment>
          ))}
        </p>
      );
  }
}

/**
 * Inline parser: **bold**, *italic*, `code`, [text](url).
 * Processes tokens left-to-right to avoid nested-regex pitfalls.
 */
function renderInline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  let rest = text;
  let key = 0;

  // Order matters: link before bold (to allow **[x](y)**), then bold before italic
  const patterns: Array<{ re: RegExp; render: (m: RegExpMatchArray) => ReactNode }> = [
    {
      re: /\[([^\]]+)\]\(([^)\s]+)\)/,
      render: (m) => (
        <a
          key={key++}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary-fixed-dim break-all"
        >
          {m[1]}
        </a>
      ),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      render: (m) => <strong key={key++} className="font-bold text-on-surface">{m[1]}</strong>,
    },
    {
      re: /(?<![*\w])\*([^*\n]+)\*(?![*\w])/,
      render: (m) => <em key={key++} className="italic">{m[1]}</em>,
    },
    {
      re: /`([^`\n]+)`/,
      render: (m) => (
        <code
          key={key++}
          className="px-1 py-0.5 bg-surface-high rounded text-[95%] font-mono text-primary"
        >
          {m[1]}
        </code>
      ),
    },
  ];

  while (rest.length > 0) {
    let best: { start: number; len: number; node: ReactNode } | null = null;
    for (const { re, render } of patterns) {
      const m = rest.match(re);
      if (m && m.index !== undefined) {
        if (!best || m.index < best.start) {
          best = { start: m.index, len: m[0].length, node: render(m) };
        }
      }
    }

    if (!best) {
      tokens.push(<Fragment key={key++}>{rest}</Fragment>);
      break;
    }

    if (best.start > 0) {
      tokens.push(<Fragment key={key++}>{rest.slice(0, best.start)}</Fragment>);
    }
    tokens.push(best.node);
    rest = rest.slice(best.start + best.len);
  }

  return tokens;
}
