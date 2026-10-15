import { visit } from 'unist-util-visit';

export const CITATION_HREF_PREFIX = 'citation-';

interface TextNode {
  type: 'text';
  value: string;
}

interface ParentNode {
  children: { type: string; value?: string }[];
}

/** Chat semantics: a single newline inside a paragraph is a hard line break. */
export const remarkBreaks = () => (tree: unknown) => {
  visit(tree as any, 'text', (node: TextNode, index?: number, parent?: ParentNode) => {
    if (!parent || index === undefined || !node.value.includes('\n')) return;
    const parts = node.value.split(/\r?\n/);
    const replacement: { type: string; value?: string }[] = [];
    parts.forEach((value, i) => {
      if (i > 0) replacement.push({ type: 'break' });
      if (value) replacement.push({ type: 'text', value });
    });
    parent.children.splice(index, 1, ...replacement);
    return index + replacement.length;
  });
};

/** Ranges of fenced code, inline code and math that text rewrites must not touch. */
const protectedRanges = (content: string, patterns: RegExp[]) => {
  const ranges: [number, number][] = [];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return (index: number) => ranges.some(([start, end]) => index >= start && index < end);
};

const CODE_PATTERNS = [/```[\s\S]*?(?:```|$)/g, /`[^`\n]*`/g];

/**
 * Rewrites `[n]` references to `[#citation-n](citation-n)` links so the link
 * renderer can resolve them against the message's citations.
 */
export const transformCitations = (content: string, count = 0): string => {
  if (count === 0) return content;
  const isProtected = protectedRanges(content, [
    ...CODE_PATTERNS,
    /\$\$[\s\S]*?\$\$/g,
    /\$[^$\n]*\$/g,
  ]);

  return content.replaceAll(/\[(\d+)\](?![(:])/g, (match, id: string, offset: number) => {
    const index = Number(id);
    if (index < 1 || index > count || isProtected(offset)) return match;
    return `[#citation-${id}](${CITATION_HREF_PREFIX}${id})`;
  });
};

/** Normalizes `\[…\]` and `\(…\)` LaTeX delimiters to the `$$` / `$` form remark-math parses. */
export const preprocessLaTeX = (content: string): string => {
  if (!content.includes('\\[') && !content.includes('\\(')) return content;
  const isProtected = protectedRanges(content, CODE_PATTERNS);

  return content
    .replaceAll(/\\\[([\s\S]*?)\\\]/g, (match, body: string, offset: number) =>
      isProtected(offset) ? match : `$$${body}$$`,
    )
    .replaceAll(/\\\(([\s\S]*?)\\\)/g, (match, body: string, offset: number) =>
      isProtected(offset) ? match : `$${body}$`,
    );
};
