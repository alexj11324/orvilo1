import type { ChatContextContent } from '@orvilo/types';
import { SquareDashedMousePointer } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
} from '@/components/ai-elements/attachments';
import { useChatInputStore } from '@/features/ChatInput/store';
import { useFileStore } from '@/store/file';

const styles = {
  selector:
    'overflow-hidden max-w-[min(420px,70vw)] font-mono text-[12px] text-muted-foreground text-ellipsis whitespace-nowrap',
  thumbnail:
    'block max-w-[min(420px,70vw)] max-h-60 border border-sidebar-border rounded-[6px] object-contain bg-card',
  tooltip: 'max-w-[min(460px,75vw)]',
  url: 'overflow-hidden text-[12px] text-(--ant-color-text-quaternary) text-ellipsis whitespace-nowrap',
};

/**
 * The chip for a DOM element picked from the in-app browser. Unlike a plain
 * text selection it shows what was picked: the tag badge in the chip, and the
 * element's own cropped screenshot in the tooltip.
 */
const ElementItem = memo<ChatContextContent>(({ element, id, preview }) => {
  const { t } = useTranslation('common');
  const contextSelectionKey = useChatInputStore((s) => s.contextSelectionKey);
  const [removeSelection] = useFileStore((s) => [s.removeChatContextSelection]);
  if (!element) return null;

  const tooltip = (
    <div className={styles.tooltip}>
      {element.thumbnailUrl && (
        <img
          alt={element.selector || element.tag}
          className={styles.thumbnail}
          src={element.thumbnailUrl}
        />
      )}
      <div className={styles.selector}>{element.selector || `<${element.tag}>`}</div>
      {(element.pageTitle || element.url) && (
        <div className={styles.url}>{element.pageTitle || element.url}</div>
      )}
    </div>
  );

  return (
    <AttachmentHoverCard>
      <AttachmentHoverCardTrigger
        render={
          <Attachment
            className="min-w-0 max-w-full"
            data={{
              type: 'source-document',
              id,
              sourceId: id,
              mediaType: 'text/html',
              title: `<${element.tag}> ${preview || ''}`.trim(),
            }}
            onRemove={() => {
              if (contextSelectionKey) removeSelection({ contextKey: contextSelectionKey, id });
            }}
          >
            <AttachmentPreview fallbackIcon={<SquareDashedMousePointer className="size-3" />} />
            <AttachmentInfo className="max-w-64" />
            <AttachmentRemove label={t('close')} />
          </Attachment>
        }
      />
      <AttachmentHoverCardContent>{tooltip}</AttachmentHoverCardContent>
    </AttachmentHoverCard>
  );
});

ElementItem.displayName = 'ElementItem';

export default ElementItem;
