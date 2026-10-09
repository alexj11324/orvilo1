'use client';

import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  type DataMessagePartComponent,
  MessagePrimitive,
  type ReasoningMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAuiState,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import type { TaskBlock, TaskDetail, UIChatMessage } from '@orvilo/types';
import { Check, ChevronLeft, ChevronRight, Copy, Pencil, RefreshCw, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import remarkGfm from 'remark-gfm';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import ToolDetail from '@/features/Conversation/Messages/AssistantGroup/Tool/Detail';
import AudioFileListViewer from '@/features/Conversation/Messages/User/components/AudioFileListViewer';
import FileListViewer from '@/features/Conversation/Messages/User/components/FileListViewer';
import ImageFileListViewer from '@/features/Conversation/Messages/User/components/ImageFileListViewer';
import PageSelections from '@/features/Conversation/Messages/User/components/PageSelections';
import VideoFileListViewer from '@/features/Conversation/Messages/User/components/VideoFileListViewer';
import {
  getBotSender,
  resolveSenderIdentity,
} from '@/features/Conversation/Messages/User/resolveSenderIdentity';
import ScheduledRunFooter from '@/features/Conversation/Messages/User/ScheduledRunFooter';
import { useConversationStore } from '@/features/Conversation/store';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import type { MessageSource } from './messages';

const markdownClassName =
  'aui-markdown text-base leading-7 break-words [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_code]:font-mono [&_code]:text-sm [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_table]:block [&_table]:overflow-auto [&_th]:border [&_th]:p-2 [&_td]:border [&_td]:p-2 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold';

export function MarkdownText() {
  return <MarkdownTextPrimitive className={markdownClassName} remarkPlugins={[remarkGfm]} />;
}

const Reasoning: ReasoningMessagePartComponent = ({ text }) => {
  const { t } = useTranslation('chat');
  return (
    <details className="my-3 rounded-xl border px-4 py-3 text-sm text-muted-foreground">
      <summary className="cursor-pointer">{t('assistantUi.reasoning')}</summary>
      <div className="mt-3 whitespace-pre-wrap">{text}</div>
    </details>
  );
};

const ToolPart: ToolCallMessagePartComponent = ({
  toolCallId,
  toolName,
  argsText,
  result,
  status,
}) => {
  const { t } = useTranslation('chat');
  const source = useAuiState((s) => s.message.metadata.custom.orvilo as MessageSource);
  const readOnly = useAuiState((s) => s.thread.isDisabled);
  const original = source.tools[toolCallId];
  const pending = original?.tool.intervention?.status === 'pending';
  return (
    <details className="my-3 rounded-xl border text-sm" open={pending || undefined}>
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
        {status.type === 'running' ? <Spinner className="size-4" /> : <Wrench className="size-4" />}
        <span className="min-w-0 flex-1 truncate">{toolName}</span>
        {pending && <span className="text-muted-foreground">{t('assistantUi.approval')}</span>}
      </summary>
      <div className="space-y-3 overflow-auto border-t p-4">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
          {argsText}
        </pre>
        {original ? (
          <ToolDetail
            {...original.tool}
            showCustomToolRender
            disableEditing={readOnly}
            messageId={original.blockId}
            toolCallId={original.tool.id}
            toolMessageId={original.tool.result_msg_id}
          />
        ) : result !== undefined ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </div>
    </details>
  );
};

const DomainPart: DataMessagePartComponent = ({ name, data }) => {
  const { t } = useTranslation('chat');
  const messageId = useAuiState((s) => s.message.id);
  if (name === 'orvilo-selections')
    return (
      <PageSelections
        selections={
          data as NonNullable<NonNullable<UIChatMessage['metadata']>['contextSelections']>
        }
      />
    );
  if (name === 'orvilo-media') {
    const media = data as UIChatMessage;
    return (
      <div className="my-3 space-y-3">
        {!!media.imageList?.length && <ImageFileListViewer items={media.imageList} />}
        {!!media.fileList?.length && <FileListViewer items={media.fileList} />}
        {!!media.audioList?.length && (
          <AudioFileListViewer items={media.audioList} messageId={messageId} />
        )}
        {!!media.videoList?.length && <VideoFileListViewer items={media.videoList} />}
      </div>
    );
  }
  if (name === 'orvilo-task') {
    const task = data as TaskBlock | TaskDetail;
    return (
      <Button
        className="my-2 h-auto w-full justify-between gap-3 px-4 py-3 text-left"
        variant="outline"
        onClick={() => void useChatStore.getState().switchThread(task.threadId)}
      >
        <span className="min-w-0 whitespace-normal">{task.title || t('assistantUi.task')}</span>
        <span className="text-xs text-muted-foreground">{task.status}</span>
      </Button>
    );
  }
  if (name === 'orvilo-error') {
    const error = data as { message?: string; type?: string };
    return (
      <div
        className="my-3 rounded-xl border border-destructive/30 p-3 text-sm text-destructive-text"
        role="alert"
      >
        {error.message || t('assistantUi.responseError')}
      </div>
    );
  }
  if (name === 'orvilo-compressed') {
    return (
      <details className="my-3 rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer">{t('assistantUi.compressed')}</summary>
        {(data as UIChatMessage[]).map((item) => (
          <p className="mt-3 whitespace-pre-wrap" key={item.id}>
            {item.content}
          </p>
        ))}
      </details>
    );
  }
  return null;
};

function UserIdentity({ message }: { message: UIChatMessage }) {
  const { t } = useTranslation('chat');
  const workspace = useActiveWorkspaceId();
  const selfAvatar = useUserAvatar();
  const selfTitle = useUserStore(userProfileSelectors.displayUserName);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const botSender = getBotSender(message);
  const identity = resolveSenderIdentity({
    botSender,
    currentUserId,
    selfAvatar,
    selfTitle,
    sender: message.sender,
    unknownLabel: t('sender.unknownMember'),
  });
  if (!workspace && !botSender) return null;
  return <span className="text-xs font-medium text-muted-foreground">{identity.title}</span>;
}

function Branches() {
  const { t } = useTranslation('chat');
  const source = useAuiState((s) => s.message.metadata.custom.orvilo as MessageSource);
  const disabled = useAuiState((s) => s.thread.isDisabled || s.thread.isRunning);
  const switchBranch = useConversationStore((s) => s.switchMessageBranch);
  const branch = source.message.branch;
  if (!branch || branch.count < 2) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Button
        aria-label={t('assistantUi.previousBranch')}
        disabled={disabled || branch.activeBranchIndex === 0}
        size="icon-sm"
        variant="ghost"
        onClick={() => void switchBranch(source.message.id, branch.activeBranchIndex - 1)}
      >
        <ChevronLeft />
      </Button>
      {branch.activeBranchIndex + 1}/{branch.count}
      <Button
        aria-label={t('assistantUi.nextBranch')}
        disabled={disabled || branch.activeBranchIndex + 1 === branch.count}
        size="icon-sm"
        variant="ghost"
        onClick={() => void switchBranch(source.message.id, branch.activeBranchIndex + 1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function EditComposer() {
  const { t } = useTranslation('common');
  return (
    <ComposerPrimitive.Root className="my-4 flex w-full flex-col gap-3 rounded-xl border bg-muted p-4">
      <ComposerPrimitive.Input
        aria-label={t('edit')}
        className="min-h-24 w-full resize-none bg-transparent outline-none"
      />
      <div className="flex justify-end gap-2">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost">{t('cancel')}</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button>{t('save')}</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}

/** Upstream assistant-ui message layout, with Orvilo tool/media parts plugged in. */
export default function ChatMessage() {
  const { t } = useTranslation('common');
  const { t: chat } = useTranslation('chat');
  const user = useAuiState((s) => s.message.role === 'user');
  const editing = useAuiState((s) => s.message.composer.isEditing);
  const id = useAuiState((s) => s.message.id);
  const source = useAuiState((s) => s.message.metadata.custom.orvilo as MessageSource);
  const running = useAuiState((s) => s.message.status?.type === 'running');
  if (editing) return <EditComposer />;
  return (
    <MessagePrimitive.Root
      className={`aui-message group flex w-full flex-col gap-2 ${user ? 'items-end' : 'items-start'}`}
      data-message-id={id}
    >
      {user && <UserIdentity message={source.message} />}
      <div className={user ? 'max-w-[85%] rounded-3xl bg-muted px-5 py-3' : 'w-full min-w-0'}>
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning,
            tools: { Fallback: ToolPart },
            data: { Fallback: DomainPart },
          }}
        />
        <MessagePrimitive.If empty>
          {running && <Spinner className="size-4 text-muted-foreground" />}
        </MessagePrimitive.If>
      </div>
      {user && <ScheduledRunFooter id={id} />}
      <ActionBarPrimitive.Root
        autohide="not-last"
        className="flex items-center gap-1 text-muted-foreground"
      >
        <ActionBarPrimitive.Copy asChild>
          <Button aria-label={t('copy')} size="icon-sm" title={t('copy')} variant="ghost">
            <AuiIf condition={(s) => s.message.isCopied} fallback={<Copy />}>
              <Check />
            </AuiIf>
          </Button>
        </ActionBarPrimitive.Copy>
        {user ? (
          <ActionBarPrimitive.Edit asChild>
            <Button aria-label={t('edit')} size="icon-sm" title={t('edit')} variant="ghost">
              <Pencil />
            </Button>
          </ActionBarPrimitive.Edit>
        ) : (
          <ActionBarPrimitive.Reload asChild>
            <Button
              aria-label={chat('assistantUi.retry')}
              size="icon-sm"
              title={chat('assistantUi.retry')}
              variant="ghost"
            >
              <RefreshCw />
            </Button>
          </ActionBarPrimitive.Reload>
        )}
        <Branches />
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}
