import type { ChatContextContent } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
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

const styles = createStaticStyles(({ css }) => ({
  selector: css`
    overflow: hidden;

    max-width: min(420px, 70vw);

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  thumbnail: css`
    display: block;

    max-width: min(420px, 70vw);
    max-height: 240px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 6px;

    object-fit: contain;
    background: ${cssVar.colorBgContainer};
  `,
  tooltip: css`
    max-width: min(460px, 75vw);
  `,
  url: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

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
