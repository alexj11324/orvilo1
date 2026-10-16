/**
 * Convert a Lexical editor state written by `@lobehub/editor` into the node set
 * of the shadcn-editor "Editor X" build (Lexical 0.52).
 *
 * Pure and idempotent: the input is never mutated, and converting an already
 * converted state returns an equal state with `changed: false`.
 *
 * Rules (see docs/development/editor-migration-p7.md for the full table):
 * - Nodes both editors share pass through, minus the LobeHub node identity
 *   (`id` and `$.properties`), which only LiteXML used.
 * - LobeHub nodes with a shadcn-editor equivalent are mapped onto it.
 * - LobeHub nodes without one degrade to a link, text or paragraph so their
 *   visible text survives.
 * - Pending AI review nodes (`diff`, `diff-content`, `table-row-diff`,
 *   `table-cell-diff`) are resolved as "reject": the original text is kept.
 * - Editing artefacts (`cursor`, autocomplete placeholders) are dropped.
 */

type JsonObject = Record<string, unknown>;

export interface SerializedNodeLike extends JsonObject {
  children?: unknown[];
  type: string;
}

export interface SerializedEditorStateLike extends JsonObject {
  root: SerializedNodeLike;
}

export interface LegacyConversionReport {
  /** Legacy node types mapped onto a shadcn-editor node, by source type. */
  converted: Record<string, number>;
  /** Node types with no equivalent that were degraded to link, text or paragraph. */
  degraded: Record<string, number>;
  /** Editing artefacts removed without visible text loss, by source type. */
  dropped: Record<string, number>;
  /** Pending AI review nodes resolved as "reject". */
  rejectedDiffs: number;
}

export interface LegacyConversionResult {
  changed: boolean;
  editorState: SerializedEditorStateLike;
  report: LegacyConversionReport;
}

type Level = 'block' | 'inline';

const TEXT_FORMAT_CODE = 16;

/** Element types whose children are block nodes. */
const BLOCK_CONTAINERS = new Set(['root', 'tablecell', 'collapsible-content']);

/** Element types whose children are inline nodes. */
const INLINE_CONTAINERS = new Set([
  'autolink',
  'code',
  'collapsible-title',
  'heading',
  'link',
  'listitem',
  'paragraph',
]);

/** Node types that are valid inline content in the target editor. */
const INLINE_TYPES = new Set([
  'action-tag',
  'autolink',
  'code-highlight',
  'emoji',
  'hashtag',
  'image',
  'linebreak',
  'link',
  'local-file-tag',
  'mention',
  'refer-topic',
  'tab',
  'text',
]);

/**
 * Types that exist unchanged in the target node set. The three chat-input
 * decorators are Orvilo-owned nodes that P7 ports to the new editor as-is.
 */
const PASSTHROUGH_TYPES = new Set([
  'action-tag',
  'autolink',
  'code-highlight',
  'collapsible-container',
  'collapsible-content',
  'collapsible-title',
  'emoji',
  'equation',
  'hashtag',
  'heading',
  'horizontalrule',
  'linebreak',
  'link',
  'list',
  'listitem',
  'local-file-tag',
  'paragraph',
  'quote',
  'refer-topic',
  'root',
  'tab',
  'table',
  'tablecell',
  'tablerow',
  'text',
]);

const DIFF_TYPES = new Set(['diff', 'diff-content', 'table-cell-diff', 'table-row-diff']);

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNode = (value: unknown): value is SerializedNodeLike =>
  isObject(value) && typeof value.type === 'string';

const childrenOf = (node: JsonObject): SerializedNodeLike[] =>
  Array.isArray(node.children) ? node.children.filter(isNode) : [];

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const textNode = (text: string, format = 0): SerializedNodeLike => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
});

const elementNode = (
  type: string,
  children: SerializedNodeLike[],
  extra: JsonObject = {},
): SerializedNodeLike => ({
  children,
  direction: null,
  format: '',
  indent: 0,
  type,
  version: 1,
  ...extra,
});

const paragraphNode = (children: SerializedNodeLike[]): SerializedNodeLike =>
  elementNode('paragraph', children, { textFormat: 0, textStyle: '' });

const isInlineNode = (node: SerializedNodeLike): boolean =>
  INLINE_TYPES.has(node.type) || (node.type === 'equation' && node.inline === true);

/** Same normalisation as LobeHub's LinkHighlightNode.formatUrl. */
const formatHighlightUrl = (url: string): string => {
  if (/^[a-z][\d+.a-z-]*:/i.test(url)) return url;
  if (/^[#./]/.test(url)) return url;
  if (url.includes('@') && !url.startsWith('mailto:')) return `mailto:${url}`;
  if (/^\+?[\d\s()-]{5,}$/.test(url)) return `tel:${url}`;
  return `https://${url}`;
};

/** Schemes the Lexical LinkNode keeps; anything else is sanitised to about:blank. */
const isSafeLinkUrl = (url: string): boolean => /^(?:https?|mailto|tel|sms):/i.test(url);

const linkNode = (url: string, label: string, target?: unknown): SerializedNodeLike =>
  elementNode('link', [textNode(label || url)], {
    rel: target === '_blank' ? 'noreferrer' : null,
    target: typeof target === 'string' && target ? target : null,
    title: null,
    url,
  });

const linkOrText = (url: string, label: string, target?: unknown): SerializedNodeLike =>
  url && isSafeLinkUrl(url) ? linkNode(url, label, target) : textNode(label || url);

const textContentOf = (node: SerializedNodeLike): string => {
  if (typeof node.text === 'string') return node.text;
  return childrenOf(node).map(textContentOf).join('');
};

class Converter {
  report: LegacyConversionReport = { converted: {}, degraded: {}, dropped: {}, rejectedDiffs: 0 };

  private count(bucket: 'converted' | 'degraded' | 'dropped', type: string) {
    this.report[bucket][type] = (this.report[bucket][type] ?? 0) + 1;
  }

  /** Copy every field except children and the LobeHub node identity. */
  private baseFields(node: SerializedNodeLike): JsonObject {
    const { children: _children, id: _id, $: state, ...rest } = node;
    const result: JsonObject = { ...rest };

    if (isObject(state)) {
      const { properties: _properties, ...otherState } = state;
      if (Object.keys(otherState).length > 0) result.$ = otherState;
    }

    return result;
  }

  convertRoot(root: SerializedNodeLike): SerializedNodeLike {
    const children = this.convertChildren(childrenOf(root), 'block');

    return {
      ...this.baseFields(root),
      children: children.length > 0 ? children : [paragraphNode([])],
      type: 'root',
    };
  }

  /**
   * Convert a child list and fix it up for its container: block containers get
   * stray inline runs wrapped in paragraphs, inline containers get paragraphs
   * produced by degraded or rejected blocks unwrapped.
   */
  convertChildren(children: SerializedNodeLike[], level: Level): SerializedNodeLike[] {
    const converted = children.flatMap((child) => this.convert(child, level));

    if (level === 'inline') {
      return converted.flatMap((node) =>
        node.type === 'paragraph' ? (childrenOf(node) as SerializedNodeLike[]) : [node],
      );
    }

    const result: SerializedNodeLike[] = [];
    let inlineRun: SerializedNodeLike[] = [];
    const flush = () => {
      if (inlineRun.length > 0) result.push(paragraphNode(inlineRun));
      inlineRun = [];
    };

    for (const node of converted) {
      if (isInlineNode(node)) {
        inlineRun.push(node);
      } else {
        flush();
        result.push(node);
      }
    }
    flush();

    return result;
  }

  private childLevel(type: string, fallback: Level): Level {
    if (BLOCK_CONTAINERS.has(type)) return 'block';
    if (INLINE_CONTAINERS.has(type)) return 'inline';
    return fallback;
  }

  private passthrough(node: SerializedNodeLike, level: Level): SerializedNodeLike {
    const base = this.baseFields(node);

    if (!Array.isArray(node.children)) return base as SerializedNodeLike;

    // Quote and table/list structure nodes keep the child shape they were given.
    const children =
      BLOCK_CONTAINERS.has(node.type) || INLINE_CONTAINERS.has(node.type)
        ? this.convertChildren(childrenOf(node), this.childLevel(node.type, level))
        : childrenOf(node).flatMap((child) => this.convert(child, level));

    if (node.type === 'table') return this.withAdjustedTable(base, node, children);
    if (node.type === 'listitem' && children.some((child) => child.type === REMOVED_LIST_ITEM)) {
      return { type: REMOVED_LIST_ITEM };
    }

    return { ...base, children } as SerializedNodeLike;
  }

  convert(node: SerializedNodeLike, level: Level): SerializedNodeLike[] {
    if (DIFF_TYPES.has(node.type)) return this.rejectDiff(node, level);

    switch (node.type) {
      case 'cursor':
      case 'PlaceholderBlock':
      case 'PlaceholderInline': {
        this.count('dropped', node.type);
        return [];
      }

      case 'code': {
        return Array.isArray(node.children)
          ? [this.passthrough(node, level)]
          : this.convertCodeMirror(node, level);
      }

      case 'codeInline': {
        this.count('converted', node.type);
        return this.convertChildren(childrenOf(node), 'inline').map((child) =>
          child.type === 'text'
            ? { ...child, format: (Number(child.format) || 0) | TEXT_FORMAT_CODE }
            : child,
        );
      }

      case 'mention': {
        // A converted mention is a TextNode and already carries `text`.
        if (typeof node.text === 'string') return [this.passthrough(node, level)];
        this.count('converted', node.type);
        const label = str(node.label);
        const metadata = isObject(node.metadata) && Object.keys(node.metadata).length > 0;
        return [
          {
            detail: 1,
            format: 0,
            mentionName: label,
            ...(metadata ? { metadata: node.metadata } : {}),
            mode: 'segmented',
            style: '',
            text: label,
            type: 'mention',
            version: 1,
          },
        ];
      }

      case 'image':
      case 'block-image': {
        return this.convertImage(node);
      }

      case 'math':
      case 'mathBlock': {
        this.count('converted', node.type);
        return [
          {
            equation: str(node.code),
            inline: node.type === 'math' || level === 'inline',
            type: 'equation',
            version: 1,
          },
        ];
      }

      case 'collapsible': {
        return [this.convertCollapsible(node)];
      }

      case 'linkHighlight': {
        this.count('converted', node.type);
        const label = textContentOf(node);
        const url = label.trim();
        return url ? [linkOrText(formatHighlightUrl(url), label)] : [];
      }

      case 'link-card':
      case 'link-block-card': {
        this.count('degraded', node.type);
        return [linkOrText(str(node.url), str(node.title), node.openTarget)];
      }

      case 'link-iframe': {
        this.count('degraded', node.type);
        const url = str(node.url) || str(node.src);
        return [linkOrText(url, str(node.title))];
      }

      case 'schema-link': {
        this.count('degraded', node.type);
        return [linkOrText(str(node.url), str(node.title))];
      }

      case 'file': {
        this.count('degraded', node.type);
        return [linkOrText(str(node.fileUrl), str(node.name), '_blank')];
      }
    }

    if (PASSTHROUGH_TYPES.has(node.type)) return [this.passthrough(node, level)];

    return this.degradeUnknown(node, level);
  }

  private convertCodeMirror(node: SerializedNodeLike, level: Level): SerializedNodeLike[] {
    this.count('converted', 'code');
    const code = str(node.code);

    if (level === 'inline') return code ? [textNode(code, TEXT_FORMAT_CODE)] : [];

    const children: SerializedNodeLike[] = [];
    code.split('\n').forEach((line, index) => {
      if (index > 0) children.push({ type: 'linebreak', version: 1 });
      if (line) children.push(textNode(line));
    });

    const language = str(node.language);
    return [elementNode('code', children, language ? { language } : {})];
  }

  private convertImage(node: SerializedNodeLike): SerializedNodeLike[] {
    const src = str(node.src);

    if (!src || src.startsWith('blob:')) {
      // An upload that never finished has no durable source to show.
      this.count('degraded', node.type);
      const alt = str(node.altText);
      return alt ? [textNode(alt)] : [];
    }

    const alreadyConverted = node.type === 'image' && !('status' in node) && !('id' in node);
    if (!alreadyConverted) this.count('converted', node.type);

    const image: SerializedNodeLike = {
      altText: str(node.altText),
      maxWidth: typeof node.maxWidth === 'number' ? node.maxWidth : 500,
      src,
      type: 'image',
      version: 1,
    };
    if (typeof node.width === 'number' && node.width > 0) image.width = node.width;
    if (typeof node.height === 'number' && node.height > 0) image.height = node.height;

    return [image];
  }

  private convertCollapsible(node: SerializedNodeLike): SerializedNodeLike {
    this.count('converted', node.type);
    const [first, ...rest] = childrenOf(node);
    const title = str(node.title);

    // LobeHub keeps the summary as the first paragraph; older rows only have `title`.
    const firstIsTitle =
      first?.type === 'paragraph' && (!title || textContentOf(first).trim() === title.trim());
    const titleChildren = firstIsTitle
      ? this.convertChildren(childrenOf(first), 'inline')
      : [textNode(title || 'Details')];
    const bodySource = firstIsTitle ? rest : childrenOf(node);
    const body = this.convertChildren(bodySource, 'block');

    return elementNode(
      'collapsible-container',
      [
        elementNode('collapsible-title', titleChildren),
        elementNode('collapsible-content', body.length > 0 ? body : [paragraphNode([])]),
      ],
      { open: node.collapsed !== true },
    );
  }

  /** Resolve a pending AI change the way DiffAction.Reject does in @lobehub/editor. */
  private rejectDiff(node: SerializedNodeLike, level: Level): SerializedNodeLike[] {
    const children = childrenOf(node);

    if (node.type === 'diff-content') {
      return this.convertChildren(children, level);
    }

    if (node.type === 'table-row-diff') {
      this.report.rejectedDiffs += 1;
      if (node.diffType === 'add') return [];
      const { changeId: _c, diffType: _d, ...row } = node;
      return [this.passthrough({ ...row, type: 'tablerow' }, level)];
    }

    if (node.type === 'table-cell-diff') {
      this.report.rejectedDiffs += 1;
      if (node.diffType === 'add') return [{ type: REMOVED_CELL }];
      const { changeId: _c, diffType: _d, ...cell } = node;
      const [first] = children;
      // A cell whose first child is a diff keeps everything that diff wraps.
      const content = first?.type === 'diff' ? childrenOf(first) : children;
      return [
        {
          ...this.baseFields(cell as SerializedNodeLike),
          children: this.convertChildren(content, 'block'),
          type: 'tablecell',
        },
      ];
    }

    this.report.rejectedDiffs += 1;

    switch (node.diffType) {
      case 'add': {
        return [];
      }

      case 'listItemAdd': {
        // Rejecting an added list item removes the whole item.
        return [{ type: REMOVED_LIST_ITEM }];
      }

      case 'listItemModify': {
        const [origin] = children;
        if (!origin) return [];
        return Array.isArray(origin.children)
          ? this.convertChildren(childrenOf(origin), level)
          : this.convert(origin, level);
      }

      case 'listItemRemove':
      case 'unchanged': {
        return this.convertChildren(children, level);
      }

      default: {
        // modify / remove: the first child is the original side.
        const [origin] = children;
        if (!origin) return [];
        return origin.type === 'diff-content'
          ? this.convertChildren(childrenOf(origin), level)
          : this.convert(origin, level);
      }
    }
  }

  /**
   * Drop placeholder rows/cells left by rejected table diffs and shrink
   * `colWidths` for columns that disappeared from every row.
   */
  private withAdjustedTable(
    base: JsonObject,
    source: SerializedNodeLike,
    rows: SerializedNodeLike[],
  ): SerializedNodeLike {
    let removedColumns: Set<number> | undefined;

    const cleanRows = rows.map((row) => {
      const cells = childrenOf(row);
      const removed = new Set<number>();
      cells.forEach((cell, index) => {
        if (cell.type === REMOVED_CELL) removed.add(index);
      });
      removedColumns = removedColumns
        ? new Set([...removedColumns].filter((index) => removed.has(index)))
        : removed;

      return removed.size > 0
        ? { ...row, children: cells.filter((cell) => cell.type !== REMOVED_CELL) }
        : row;
    });

    const table: SerializedNodeLike = { ...base, children: cleanRows } as SerializedNodeLike;

    if (Array.isArray(source.colWidths) && removedColumns && removedColumns.size > 0) {
      table.colWidths = source.colWidths.filter((_, index) => !removedColumns!.has(index));
    }

    return table;
  }

  private degradeUnknown(node: SerializedNodeLike, level: Level): SerializedNodeLike[] {
    this.count('degraded', node.type);

    if (Array.isArray(node.children)) {
      const children = this.convertChildren(childrenOf(node), level);
      return level === 'block' && children.every(isInlineNode) && children.length > 0
        ? [paragraphNode(children)]
        : children;
    }

    const text =
      str(node.text) || str(node.title) || str(node.label) || str(node.name) || str(node.url);

    return text ? [textNode(text)] : [];
  }
}

const REMOVED_LIST_ITEM = '__removed-list-item__';
const REMOVED_CELL = '__removed-table-cell__';

const stripMarkers = (node: SerializedNodeLike): SerializedNodeLike => {
  if (!Array.isArray(node.children)) return node;

  return {
    ...node,
    children: childrenOf(node)
      .filter((child) => child.type !== REMOVED_LIST_ITEM && child.type !== REMOVED_CELL)
      .map(stripMarkers),
  };
};

/** JSON with sorted keys, so key order alone never counts as a change. */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!isObject(value)) return JSON.stringify(value) ?? 'null';

  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
};

export const isLegacyEditorState = (value: unknown): value is SerializedEditorStateLike =>
  isObject(value) && isNode(value.root) && value.root.type === 'root';

/**
 * Convert a stored `@lobehub/editor` state (object or JSON string) into the
 * shadcn-editor node set. Throws a TypeError for input without a Lexical root.
 */
export const convertLegacyEditorState = (input: unknown): LegacyConversionResult => {
  const parsed = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;

  if (!isLegacyEditorState(parsed)) {
    throw new TypeError('convertLegacyEditorState: input is not a Lexical editor state');
  }

  const converter = new Converter();
  const root = stripMarkers(converter.convertRoot(parsed.root));
  const editorState: SerializedEditorStateLike = { ...parsed, root };

  return {
    changed: stableStringify(editorState) !== stableStringify(parsed),
    editorState,
    report: converter.report,
  };
};
