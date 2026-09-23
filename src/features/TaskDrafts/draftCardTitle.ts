import { draftPreviewDocument } from './draftPreviewDocument';

interface DraftTitleSource {
  content: string;
  editorData: unknown;
  taskIdentifier: string;
  taskName: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Leaf decorator/mention nodes carry their visible label under one of these
// keys: mention.label, local-file-tag.name, refer-topic.topicTitle,
// action-tag.actionLabel.
const LEAF_LABEL_KEYS = ['label', 'name', 'topicTitle', 'actionLabel'] as const;

const nodeText = (node: unknown): string => {
  if (!isRecord(node)) return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('');
  for (const key of LEAF_LABEL_KEYS) {
    const label = node[key];
    if (typeof label === 'string') return label;
  }
  return '';
};

/** First non-empty block of the saved editor document — the card's first line. */
export const draftExcerpt = (editorData: unknown): string | null => {
  const document = draftPreviewDocument(editorData);
  const children = document && isRecord(document.root) ? document.root.children : null;
  if (!Array.isArray(children)) return null;
  for (const block of children) {
    const text = nodeText(block).replaceAll(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
};

const firstLine = (content: string): string | null => {
  for (const line of content.split('\n')) {
    const text = line.trim();
    if (text) return text;
  }
  return null;
};

/**
 * The reference card leads with the draft's own first line, not the issue
 * name — the issue identifier lives on the `Commenting on an issue` chip
 * (ref-2026-09-23/NEW-FINDINGS §8 DOM forensics). Falls back through the same
 * plain-text chain the preview body uses so the card always has a title.
 */
export const draftCardTitle = (draft: DraftTitleSource, attachmentLabel: string): string =>
  draftExcerpt(draft.editorData) ?? firstLine(draft.content) ?? attachmentLabel;
