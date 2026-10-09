import type { ChatContextContent } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { Code2Icon, TextIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
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
  codeLine: css`
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 10px;
  `,
  codePreview: css`
    overflow: auto;

    max-width: min(560px, 80vw);
    max-height: 220px;
    margin: 0;
    padding-block: 8px;
    padding-inline: 0;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    line-height: 1.55;
  `,
  content: css`
    overflow: hidden;

    min-width: 0;

    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: pre;
  `,
  lineNumber: css`
    user-select: none;
    color: ${cssVar.colorTextQuaternary};
    text-align: end;
  `,
  meta: css`
    overflow: hidden;

    max-width: min(560px, 80vw);
    padding-block-end: 6px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  textPreview: css`
    max-width: min(420px, 70vw);
    color: ${cssVar.colorText};
    white-space: pre-wrap;
  `,
  truncated: css`
    padding-block-start: 4px;
    color: ${cssVar.colorTextQuaternary};
  `,
}));

const MAX_CODE_PREVIEW_LINES = 8;

const getPreviewText = (content?: string, fallback?: string) => {
  const source = content || fallback || '';
  if (!source) return 'Text selection';

  const plain = source
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (!plain) return 'Text selection';

  return plain;
};

const getLocationText = ({
  filePath,
  lineRange,
  title,
}: Pick<ChatContextContent, 'filePath' | 'lineRange' | 'title'>) => {
  const location = filePath || title;
  if (!location) return;

  if (!lineRange) return location;

  const endLine = lineRange.endLine ?? lineRange.startLine;
  return `${location}:${lineRange.startLine}-${endLine}`;
};

const SelectionItem = memo<ChatContextContent>(
  ({ content, filePath, id, lineRange, preview, source, title }) => {
    const { t } = useTranslation('common');
    const contextSelectionKey = useChatInputStore((s) => s.contextSelectionKey);
    const [removeSelection] = useFileStore((s) => [s.removeChatContextSelection]);

    const displayText = useMemo(
      () => getPreviewText(preview || getLocationText({ filePath, lineRange, title }), content),
      [content, filePath, lineRange, preview, title],
    );
    const isCodeSelection = source === 'code' || Boolean(filePath);

    const tooltip = useMemo(() => {
      if (!isCodeSelection) {
        return <div className={styles.textPreview}>{preview || content}</div>;
      }

      const lines = content.split('\n');
      const previewLines = lines.slice(0, MAX_CODE_PREVIEW_LINES);
      const startLine = lineRange?.startLine ?? 1;

      return (
        <div>
          <div className={styles.meta}>
            {getLocationText({ filePath, lineRange, title }) || preview || title}
          </div>
          <pre className={styles.codePreview}>
            {previewLines.map((line, index) => (
              <div className={styles.codeLine} key={`${index}-${line}`}>
                <span className={styles.lineNumber}>{startLine + index}</span>
                <code className={styles.content}>{line || ' '}</code>
              </div>
            ))}
            {lines.length > MAX_CODE_PREVIEW_LINES && (
              <div className={`${styles.codeLine} ${styles.truncated}`}>
                <span className={styles.lineNumber}>...</span>
                <code className={styles.content}>...</code>
              </div>
            )}
          </pre>
        </div>
      );
    }, [content, filePath, isCodeSelection, lineRange, preview, title]);

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
                mediaType: isCodeSelection ? 'text/plain' : 'text/html',
                title: displayText,
              }}
              onRemove={() => {
                if (contextSelectionKey) removeSelection({ contextKey: contextSelectionKey, id });
              }}
            >
              <AttachmentPreview
                fallbackIcon={
                  isCodeSelection ? (
                    <Code2Icon className="size-3" />
                  ) : (
                    <TextIcon className="size-3" />
                  )
                }
              />
              <AttachmentInfo className="max-w-64" />
              <AttachmentRemove label={t('close')} />
            </Attachment>
          }
        />
        <AttachmentHoverCardContent>{tooltip}</AttachmentHoverCardContent>
      </AttachmentHoverCard>
    );
  },
);

SelectionItem.displayName = 'SelectionItem';

export default SelectionItem;
