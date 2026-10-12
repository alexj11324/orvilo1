import { createStaticStyles } from 'antd-style';

import pagePresentation from '../PageEditor.module.css';

/** Max rendered height of an image inside the comment composer / edit box. */
export const COMMENT_EDITOR_IMAGE_MAX_HEIGHT = 400;
/** Max rendered height of an image inside a published comment. */
export const COMMENT_CONTENT_IMAGE_MAX_HEIGHT = 480;

/**
 * Comment boxes grow with their content indefinitely (Yuque-style) — the page
 * scrolls, the box never scrolls internally. `ChatInput` applies a 320px cap
 * by default, so pass this effectively-unbounded value to neutralize it.
 */
export const COMMENT_INPUT_MAX_HEIGHT = 100_000;

/**
 * An image the user has explicitly resized. The editor's image plugin writes
 * the dragged width to the `<img>` inline style (`width: 320px`) while an
 * untouched image carries `width: inherit`; `LexicalRenderer` (published
 * comments) only inlines `width` once the node has one. `width` may be the
 * first declaration (a node without `maxWidth` renders `style="width: 320px"`)
 * or follow `max-width`, so both the start-of-value and the leading-space forms
 * are matched; `max-width` itself never matches either form. This is the one
 * signal that separates "user picked a size" from "thumbnail default".
 */
export const RESIZED_IMAGE_SELECTOR =
  'img:is([style^="width:"], [style*=" width:"]):not([style^="width: inherit"]):not([style*=" width: inherit"])';

const RESIZED_IMAGE = RESIZED_IMAGE_SELECTOR;

const retainedImageStyles = createStaticStyles(({ css }) => ({
  commentContent: css`
    /* Published comments render images as left-aligned thumbnails: the
       renderer inlines the stored (natural) width, which would otherwise span
       the whole column. */
    & figure:has(> img) {
      margin-block: 8px;
      text-align: start;
    }

    & img {
      max-width: 100% !important;
      height: auto !important;
    }

    /* Thumbnail default only for images the author never resized — a stored
       width is the author's choice and is honoured exactly like the body. */
    & img:not(${RESIZED_IMAGE}) {
      width: auto !important;
      max-height: ${COMMENT_CONTENT_IMAGE_MAX_HEIGHT}px;
    }
  `,
  commentEditor: css`
    min-width: 0;

    /* Horizontal breathing room for the editor body, on top of ChatInput's own
       12px. Kept out of the editor's style prop: the editor forwards that prop
       to its absolutely positioned placeholder too, so any inline padding
       there would push the placeholder past the caret. */
    padding-inline: 16px;

    /* The placeholder carries a 4px top margin meant to mirror a paragraph's
       default margin; the first block below has that margin removed, so drop
       the placeholder's as well to keep it on the caret line. It is an
       absolutely positioned later sibling of the editable area, after a
       couple of empty plugin slots, hence the general sibling selector. */
    & [contenteditable='true'] ~ div {
      margin-block-start: 0 !important;
    }

    /* Rich Markdown blocks carry document margins by default. A chat input
       keeps only inter-block rhythm so the first typed heading never jumps. */
    & [contenteditable='true'] > :first-child {
      margin-block-start: 0 !important;
    }

    & [contenteditable='true'] > :last-child {
      margin-block-end: 0 !important;
    }

    /* The image plugin sizes a pasted image at its natural width with no
       height bound. Comments keep images generous (near full column width,
       like the document body) but aspect-preserving and height-capped, and
       left-aligned like the text with breathing room above and below. */
    & [contenteditable='true'] :has(> img) {
      width: auto !important;
      max-width: 100% !important;
      text-align: start;
    }

    & [contenteditable='true'] > div:has(img) {
      margin-block: 8px;
      text-align: start;
    }

    & [contenteditable='true'] img {
      max-width: 100% !important;
      height: auto !important;
    }

    /* Only untouched images get the thumbnail treatment. Forcing width: auto
       on every image would beat the inline width the resize handles write, so
       dragging would appear to do nothing. */
    & [contenteditable='true'] img:not(${RESIZED_IMAGE}) {
      width: auto !important;
      max-height: ${COMMENT_EDITOR_IMAGE_MAX_HEIGHT}px;
    }
  `,
}));

export const styles = {
  actions: `${pagePresentation.commentActions} pbs-2 text-muted-foreground`,
  body: `${pagePresentation.commentBody} pbs-2 text-sm leading-5.5`,
  card: `${pagePresentation.commentCard} -mx-3 px-3 rounded-(--radius-card) transition-[background-color] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none`,
  commentContent: retainedImageStyles.commentContent,
  commentEditor: retainedImageStyles.commentEditor,
  composer:
    'min-w-0 rounded-(--radius-input) transition-[border-color,box-shadow] duration-(--orvilo-motion-fast) ease-[ease] focus-within:border-primary focus-within:[box-shadow:0_0_0_2px_var(--primary-wash)] motion-reduce:transition-none',
  composerAvatar: 'flex-none self-start',
  deleted: 'italic text-muted-foreground',
  editComposer:
    'min-w-0 rounded-(--radius-input) focus-within:border-primary focus-within:[box-shadow:0_0_0_2px_var(--primary-wash)]',
  header: 'min-h-8',
  highlighted: 'bg-primary-wash',
  meta: 'text-xs leading-5 text-muted-foreground',
  replyBody: `${pagePresentation.commentReplyBody}`,
  replyCard: `${pagePresentation.commentReplyCard}`,
  replyCardActions: `${pagePresentation.commentReplyActions}`,
  replyList: 'mis-10 py-1 pis-4',
  replyTargetIcon: 'flex-none text-muted-foreground',
  section: 'w-full mbs-8 pbe-20',
  textarea: 'resize-none p-0 text-sm leading-5.5',
  thread: 'pbe-5 border-be border-divider last:border-be-0',
  threadList: 'gap-2',
};
