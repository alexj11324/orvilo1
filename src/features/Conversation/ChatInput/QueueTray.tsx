'use client';
import { Image } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { ArrowUp, ListEnd, Pencil, Trash2 } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemAttachment,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue';
import FileIcon from '@/components/FileIcon';
import { useSingleton } from '@/hooks/useSingleton';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import {
  type QueuedFile,
  type QueuedMessage,
  reconstructUploadFilesFromQueue,
} from '@/store/chat/slices/operation/types';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { useFileStore } from '@/store/file';

import { useConversationResourceAccess } from '../hooks/useConversationResourceAccess';
import { useConversationStore } from '../store';
import { createQueueSendNowGate } from './utils';

const PREVIEW_SIZE = 28;

const styles = createStaticStyles(({ css, cssVar }) => ({
  fileChip: css`
    overflow: hidden;
    flex-shrink: 0;

    max-width: 160px;
    height: 28px;
    padding-block: 0;
    padding-inline: 6px;
    border: 1px solid ${cssVar.colorFillTertiary};
    border-radius: 6px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
  fileChipName: css`
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  imageThumb: css`
    flex-shrink: 0;

    width: 28px !important;
    height: 28px !important;
    margin-block: 0 !important;
    border: 1px solid ${cssVar.colorFillTertiary};
    border-radius: 6px;

    box-shadow: none;

    img {
      width: 28px !important;
      height: 28px !important;
      object-fit: cover;
    }
  `,
}));

const isImageFile = (f: QueuedFile) => f.mimeType.startsWith('image') && !!f.url;

interface QueuedFilePreviewProps {
  file: QueuedFile;
}

const QueuedFilePreview = memo<QueuedFilePreviewProps>(({ file }) => {
  if (isImageFile(file)) {
    // Use @lobehub/ui Image so click-to-zoom preview works. Lock both wrapper
    // and inner <img> to PREVIEW_SIZE — `size` alone doesn't constrain the
    // intrinsic image dimensions inside a flex row.
    return (
      <Image
        alt={file.name}
        classNames={{ wrapper: styles.imageThumb }}
        objectFit={'cover'}
        size={PREVIEW_SIZE}
        src={file.url}
        title={file.name}
        variant={'borderless'}
        styles={{
          image: { height: PREVIEW_SIZE, width: PREVIEW_SIZE },
          wrapper: { height: PREVIEW_SIZE, width: PREVIEW_SIZE },
        }}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-1', styles.fileChip)} title={file.name}>
      <FileIcon fileName={file.name} fileType={file.mimeType} size={14} />
      <span className={styles.fileChipName}>{file.name}</span>
    </div>
  );
});

QueuedFilePreview.displayName = 'QueuedFilePreview';

const QueueTray = memo(() => {
  const { canUseResource } = useConversationResourceAccess();
  const { t } = useTranslation('chat');
  const context = useConversationStore((s) => s.context);

  // Key off the FULL context (threadId / scope / documentId / ...) so remove /
  // edit / send-now target the same bucket the queue is stored under and
  // getQueuedMessages reads from. A reduced agentId/groupId/topicId key would
  // operate on the wrong bucket for thread / page / group_agent conversations.
  // Pass the fields explicitly (not the `context` object, which may be a fresh
  // ref each render) so the memo deps stay stable primitives.
  const contextKey = useMemo(
    () =>
      messageMapKey({
        agentId: context.agentId,
        documentId: context.documentId,
        groupId: context.groupId,
        isNew: context.isNew,
        scope: context.scope,
        subAgentId: context.subAgentId,
        threadId: context.threadId,
        topicId: context.topicId,
      }),
    [
      context.agentId,
      context.documentId,
      context.groupId,
      context.isNew,
      context.scope,
      context.subAgentId,
      context.threadId,
      context.topicId,
    ],
  );

  const queuedMessages = useChatStore((s) => operationSelectors.getQueuedMessages(context)(s));
  const removeQueuedMessage = useChatStore((s) => s.removeQueuedMessage);
  const dispatchChatUploadFileList = useFileStore((s) => s.dispatchChatUploadFileList);
  const editor = useConversationStore((s) => s.editor);
  const sendNowGate = useSingleton(createQueueSendNowGate);

  // Edit: restore both the text content AND the attached files back to the
  // input area, so the user can tweak the message and re-send. Without the
  // file restore, images attached to a queued message would silently disappear
  // when the user clicks the pencil.
  const handleEdit = useCallback(
    (msg: QueuedMessage) => {
      removeQueuedMessage(contextKey, msg.id);
      editor?.setDocument('markdown', msg.content);
      editor?.focus();
      if (msg.filesPreview?.length) {
        const restored = reconstructUploadFilesFromQueue(msg.filesPreview);
        dispatchChatUploadFileList({ files: restored, type: 'addFiles' });
      }
    },
    [contextKey, dispatchChatUploadFileList, editor, removeQueuedMessage],
  );

  // "Send now": cancel the currently running agent run for this context, then
  // immediately fire a fresh sendMessage with this queued item's payload. The
  // remaining queue (if any) stays in place — the new turn's onComplete drain
  // will pick them up after it finishes. Reads chatStore inline so we don't
  // re-subscribe the whole tray to the operations map.
  const handleSendNow = useCallback(
    async (msg: QueuedMessage) => {
      await sendNowGate
        .run(async () => {
          const chat = useChatStore.getState();
          // Cancel EVERY running blocker the item could be queued behind, not just the
          // first: matching one op would miss an interim blocker or the second of the
          // two concurrent `regenerate` ops a delAndRegenerate/delAndResendThread
          // retry runs (outer wrapper + inner regenerateUserMessage). Leaving any
          // blocker running would make the sendMessage below re-enqueue the item, so
          // "Send now" becomes a no-op. The selector shares the queue-blocking
          // predicate with the enqueue check.
          const runningOpIds =
            operationSelectors.getRunningQueueBlockingOperationIds(context)(chat);
          const cancellationConfirmed = await Promise.all(
            runningOpIds.map((id) => chat.cancelOperation(id, 'send_now')),
          );
          if (cancellationConfirmed.some((confirmed) => !confirmed)) {
            throw new Error('Running agent cancellation was not confirmed');
          }
          removeQueuedMessage(contextKey, msg.id);

          // Reconstruct UploadFileItem-shaped objects so the optimistic temp message
          // can rebuild imageList/videoList from the snapshotted preview metadata.
          const filesArray = msg.filesPreview?.length
            ? reconstructUploadFilesFromQueue(msg.filesPreview)
            : msg.files?.length
              ? (msg.files.map((id) => ({ id })) as any)
              : undefined;
          await chat.sendMessage({
            context,
            editorData: msg.editorData,
            files: filesArray,
            message: msg.content,
            metadata: { ...msg.metadata, steer: true },
          });
        })
        .catch((error) => console.error('[QueueTray] sendNow failed:', error));
    },
    [context, contextKey, removeQueuedMessage, sendNowGate],
  );

  if (queuedMessages.length === 0) return null;
  // Defense-in-depth: normally a view-only member can't enqueue at all, but a
  // mid-session access downgrade could leave items behind — never offer
  // "send now" then.
  if (!canUseResource) return null;

  return (
    <Queue data-testid="conversation-message-queue">
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={queuedMessages.length}
            icon={<ListEnd className="size-4" />}
            label={t('inputQueue.title')}
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {queuedMessages.map((msg) => (
              <QueueItem key={msg.id}>
                <div className="flex items-start gap-2">
                  <QueueItemIndicator />
                  <QueueItemContent className="min-w-0 flex-1" title={msg.content}>
                    {msg.content}
                  </QueueItemContent>
                  <QueueItemActions>
                    <QueueItemAction
                      aria-label={t('inputQueue.edit')}
                      title={t('inputQueue.edit')}
                      onClick={() => handleEdit(msg)}
                    >
                      <Pencil className="size-3.5" />
                    </QueueItemAction>
                    <QueueItemAction
                      aria-label={t('inputQueue.sendNow')}
                      title={t('inputQueue.sendNow')}
                      onClick={() => handleSendNow(msg)}
                    >
                      <ArrowUp className="size-3.5" />
                    </QueueItemAction>
                    <QueueItemAction
                      aria-label={t('inputQueue.delete')}
                      title={t('inputQueue.delete')}
                      onClick={() => removeQueuedMessage(contextKey, msg.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </QueueItemAction>
                  </QueueItemActions>
                </div>
                {!!msg.filesPreview?.length && (
                  <QueueItemAttachment>
                    {msg.filesPreview.map((file) => (
                      <QueuedFilePreview file={file} key={file.id} />
                    ))}
                  </QueueItemAttachment>
                )}
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
});

QueueTray.displayName = 'QueueTray';

export default QueueTray;
