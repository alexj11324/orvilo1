/** Structural syntax trees: no undeclared runtime/parser dependency is introduced. */
export interface MarkdownNode {
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  identifier?: string;
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  url?: string;
  value?: string;
}
interface MarkdownFile {
  data: Record<string, unknown>;
}

function walk(
  node: MarkdownNode,
  visitor: (node: MarkdownNode, parent?: MarkdownNode, index?: number) => void | false,
  parent?: MarkdownNode,
  index?: number,
) {
  if (visitor(node, parent, index) === false) return;
  // Snapshot original children; inserted citation links must not be visited twice.
  for (const child of node.children ?? []) {
    walk(child, visitor, node, node.children!.indexOf(child));
  }
}

export interface CitationItem {
  alt?: string;
  summary?: string;
  title?: string;
  url: string;
}

/** Transform parsed prose only: fences, inline code, math and existing links stay untouched. */
export const remarkCitations =
  ({ count }: { count: number }) =>
  (tree: MarkdownNode) => {
    walk(tree, (node, parent, index) => {
      if (node.type === 'link' || node.type === 'linkReference') return false;
      if (
        node.type !== 'text' ||
        !node.value ||
        !parent?.children ||
        index === undefined ||
        count === 0
      )
        return;
      const replacement: MarkdownNode[] = [];
      let end = 0;
      for (const match of node.value.matchAll(/\[(\d+)\]/g)) {
        const number = Number(match[1]);
        if (number < 1 || number > count) continue;
        const start = match.index;
        if (start > end) replacement.push({ type: 'text', value: node.value.slice(end, start) });
        replacement.push({
          type: 'link',
          url: `citation-${number}`,
          children: [{ type: 'text', value: String(number) }],
        });
        end = start + match[0].length;
      }
      if (!replacement.length) return;
      if (end < node.value.length) replacement.push({ type: 'text', value: node.value.slice(end) });
      parent.children.splice(index, 1, ...replacement);
      return false;
    });
  };

/** Keep complete string identifiers (including 10+), not the old first-character lookup. */
export const remarkFootnoteDetails = () => (tree: MarkdownNode, file: MarkdownFile) => {
  const details: Record<string, CitationItem> = Object.create(null);
  walk(tree, (definition) => {
    if (definition.type !== 'footnoteDefinition' || !definition.identifier) return;
    walk(definition, (link) => {
      if (link.type !== 'link' || !link.url) return;
      if (details[definition.identifier!]) return false;
      details[definition.identifier!] = {
        url: link.url,
        title: (link.children ?? [])
          .filter((node) => node.type === 'text')
          .map((node) => node.value)
          .join(''),
      };
      return false;
    });
  });
  file.data.nativeFootnoteDetails = details;
};

export const rehypeFootnoteDetails = () => (tree: MarkdownNode, file: MarkdownFile) => {
  const details = file.data.nativeFootnoteDetails as Record<string, CitationItem> | undefined;
  if (!details) return;
  walk(tree, (node) => {
    if (
      node.type !== 'element' ||
      node.tagName !== 'a' ||
      node.properties?.dataFootnoteRef === undefined
    )
      return;
    const href = String(node.properties.href ?? '');
    let identifier = href.replace(/^#(?:user-content-)?fn-/, '');
    try {
      identifier = decodeURIComponent(identifier);
    } catch {
      /* Preserve literal invalid URI labels. */
    }
    if (details[identifier])
      node.properties.dataCitationDetail = JSON.stringify(details[identifier]);
  });
};

/** Preserve chat soft breaks and the supported safe <br> spelling without enabling arbitrary HTML. */
export const remarkChatBreaks =
  ({ soft = true }: { soft?: boolean } = {}) =>
  (tree: MarkdownNode) => {
    walk(tree, (node, parent, index) => {
      if (!parent?.children || index === undefined) return;
      if (node.type === 'html' && /^\s*<\s*br\s*\/?>\s*$/i.test(node.value ?? '')) {
        parent.children.splice(index, 1, { type: 'break' });
        return false;
      }
      if (!soft || node.type !== 'text' || !node.value?.includes('\n')) return;
      const lines = node.value.split('\n');
      const children: MarkdownNode[] = [];
      lines.forEach((value, line) => {
        if (line) children.push({ type: 'break' });
        if (value) children.push({ type: 'text', value });
      });
      parent.children.splice(index, 1, ...children);
      return false;
    });
  };

/** GFM alert markers are parsed blockquote prose; code fences never participate. */
export const remarkGithubAlerts = () => (tree: MarkdownNode) => {
  walk(tree, (node) => {
    if (node.type !== 'blockquote') return;
    const first = node.children?.[0];
    const label = first?.children?.[0];
    if (first?.type !== 'paragraph' || label?.type !== 'text') return;
    const match = label.value?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|\s+|$)/);
    if (!match) return;
    label.value = label.value!.slice(match[0].length);
    if (!label.value) first.children!.shift();
    if (!first.children!.length) node.children!.shift();
    node.type = 'nativeGithubAlert';
    node.data = { hName: 'aside', hProperties: { dataAlert: match[1] } };
  });
};
