import pagePresentation from '../PageEditor.module.css';
import imagePresentation from './CommentImages.module.css';

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

export const styles = {
  actions: `${pagePresentation.commentActions} pbs-2 text-muted-foreground`,
  body: `${pagePresentation.commentBody} pbs-2 text-sm leading-5.5`,
  card: `${pagePresentation.commentCard} -mx-3 px-3 rounded-(--radius-card) transition-[background-color] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none`,
  commentContent: imagePresentation.commentContent,
  commentEditor: imagePresentation.commentEditor,
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
