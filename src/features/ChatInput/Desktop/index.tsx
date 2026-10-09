'use client';

import { type ChatInputProps } from '@lobehub/editor/react';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { type ReactNode, use } from 'react';
import { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Skeleton } from '@/components/ui/skeleton';
import ChatInputNotice from '@/features/ChatInput/ChatInputNotice';
import ComposerExpandButton from '@/features/ChatInput/components/ComposerExpandButton';
import { useChatInputResourceAccess } from '@/features/ChatInput/hooks/useChatInputResourceAccess';
import { useChatInputStore } from '@/features/ChatInput/store';
import { LayoutContainerContext } from '@/features/DesktopLayoutContainer/LayoutContainerContext';
import { useChatStore } from '@/store/chat';
import { chatSelectors } from '@/store/chat/selectors';
import { fileChatSelectors, useFileStore } from '@/store/file';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { type ActionToolbarProps } from '../ActionBar';
import ActionBar from '../ActionBar';
import ControlBar from '../ControlBar';
import InputEditor from '../InputEditor';
import { useSkillDrop } from '../InputEditor/ActionTag/useSkillDrop';
import { type PlaceholderVariant } from '../InputEditor/Placeholder';
import { useTopicDrop } from '../InputEditor/ReferTopic/useTopicDrop';
import { useWorkspaceFileDrop } from '../InputEditor/useWorkspaceFileDrop';
import SendArea from '../SendArea';
import TypoBar from '../TypoBar';
import ComposerBeam from './ComposerBeam';
import ContextContainer from './ContextContainer';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    .show-on-hover {
      opacity: 0;
    }

    &:hover {
      .show-on-hover {
        opacity: 1;
      }
    }
  `,
  footnote: css`
    font-size: 10px;
  `,
  fullscreen: css`
    position: absolute;
    z-index: 100;
    inset: 0;

    width: 100%;
    height: 100%;
    margin-block-start: 0;

    background: ${cssVar.colorBgContainer};
  `,
}));

interface DesktopChatInputProps extends ActionToolbarProps {
  actionBarStyle?: React.CSSProperties;
  /** Conversation-only busy effect; undefined leaves other editor surfaces unchanged. */
  beamActive?: boolean;
  /**
   * Collapse the editor to a single bordered row by dropping the action bar footer.
   * Send still works through the Enter keybinding; the rest of the chrome
   * (control bar / footnote) is independently gated by `showControlBar` /
   * `showFootnote`. Defaults to false — other surfaces stay untouched.
   */
  compact?: boolean;
  /**
   * Render the control bar (or `controlBarSlot`) as the card's last footer row
   * instead of a sibling below it. No surface sets this: the reference composer
   * keeps its controls *below* the card border, and the two agent surfaces that
   * once opted in had read that reference backwards. Kept as an escape hatch,
   * but a new caller should not set it. In `compact` mode the footer is dropped
   * entirely, so the bar falls back to the sibling position regardless.
   */
  controlBarInCard?: boolean;
  /**
   * Custom node to render in place of the default ControlBar.
   * When provided, used instead of `<ControlBar />` (ignores `showControlBar`).
   */
  controlBarSlot?: ReactNode;
  /**
   * Initial editor height in text rows (`InputEditor`'s `defaultRows`).
   * Surfaces targeting a single-line composer (e.g. the Agent page, whose
   * reference editor measures 24px) pass 1; omitted keeps the 2-row default.
   */
  editorDefaultRows?: number;
  extentHeaderContent?: ReactNode;
  hidden?: boolean;
  initialContent?: string;
  inputContainerProps?: ChatInputProps;
  /**
   * Swap the action bar and send area for skeleton placeholders while
   * the underlying agent / group / session config is still hydrating.
   * The editor itself stays usable. Wins over `leftContent` / `rightContent`.
   */
  isConfigLoading?: boolean;
  leftContent?: ReactNode;
  placeholder?: ReactNode;
  placeholderVariant?: PlaceholderVariant;
  rightContent?: ReactNode;
  sendAreaPrefix?: ReactNode;
  showControlBar?: boolean;
  showFootnote?: boolean;
}

const DesktopChatInput = memo<DesktopChatInputProps>(
  ({
    showFootnote,
    showControlBar = true,
    compact = false,
    controlBarInCard = false,
    controlBarSlot,
    editorDefaultRows,
    inputContainerProps,
    extentHeaderContent,
    actionBarStyle,
    beamActive,
    borderRadius,
    extraActionItems,
    dropdownPlacement,
    hidden,
    initialContent,
    isConfigLoading = false,
    leftContent,
    placeholder,
    placeholderVariant,
    rightContent,
    sendAreaPrefix,
  }) => {
    const { t } = useTranslation('chat');
    const layoutContainerRef = use(LayoutContainerContext);
    const [chatInputHeight, updateSystemStatus] = useGlobalStore((s) => [
      systemStatusSelectors.chatInputHeight(s),
      s.updateSystemStatus,
    ]);
    const { canUseResource, isAccessLoading } = useChatInputResourceAccess();
    const handleSendButton = useChatInputStore((s) => s.handleSendButton);
    const contextSelectionKey = useChatInputStore((s) => s.contextSelectionKey);
    const hasContextSelections = useFileStore(
      fileChatSelectors.chatContextSelectionHasItem(contextSelectionKey),
    );
    const hasFiles = useFileStore(fileChatSelectors.chatUploadFileListHasItem);
    const [slashMenuRef, expand, showTypoBar, editor, leftActions] = useChatInputStore((s) => [
      s.slashMenuRef,
      s.expand,
      s.showTypoBar,
      s.editor,
      s.leftActions,
    ]);

    const chatKey = useChatStore(chatSelectors.currentChatKey);

    // The ControlBar (or the custom slot standing in for it) hosts the
    // context-window token tag; without one, SendArea keeps it beside Send.
    const hasControlBar = Boolean(controlBarSlot) || showControlBar;

    const setExpand = useChatInputStore((s) => s.setExpand);
    const skillDrop = useSkillDrop();
    const topicDrop = useTopicDrop();
    const workspaceFileDrop = useWorkspaceFileDrop();

    // Fan a single drag event out to every custom-MIME drop handler. Each one
    // no-ops unless its own MIME is present, so ordering is irrelevant.
    const handleDragOver = (event: React.DragEvent) => {
      skillDrop.onDragOver(event);
      topicDrop.onDragOver(event);
      workspaceFileDrop.onDragOver(event);
    };
    const handleDrop = (event: React.DragEvent) => {
      skillDrop.onDrop(event);
      topicDrop.onDrop(event);
      workspaceFileDrop.onDrop(event);
    };

    useEffect(() => {
      if (editor) editor.focus();
      setExpand(false);
    }, [chatKey, editor, setExpand]);

    const shouldShowContextContainer =
      leftActions.flat().includes('fileUpload') || hasContextSelections || hasFiles;
    const contextContainerNode = shouldShowContextContainer && <ContextContainer />;

    const loadingLeftSlot = isConfigLoading ? (
      <div className="flex flex-row items-center gap-1.5 px-1">
        <Skeleton style={{ height: 28, borderRadius: '50%', width: 28 }} />
        <Skeleton style={{ height: 28, borderRadius: '50%', width: 28 }} />
      </div>
    ) : null;
    const loadingRightSlot = isConfigLoading ? (
      <Skeleton style={{ height: 32, minWidth: 64, width: 64, borderRadius: 999 }} />
    ) : null;
    const noticeNode = !isConfigLoading && <ChatInputNotice />;
    const leftSlot = (
      <>
        {leftContent ?? (
          <ActionBar
            disableCollapse
            borderRadius={borderRadius}
            dropdownPlacement={dropdownPlacement}
            extraActionItems={extraActionItems}
          />
        )}
        <ComposerExpandButton />
        {noticeNode}
      </>
    );

    // The control bar's home: a sibling under the card by default, or the
    // card's last footer row when the surface opts into `controlBarInCard`
    // (`compact` drops the footer, so the sibling position is kept there).
    const controlBarNode = controlBarSlot ?? (showControlBar && <ControlBar />);
    const controlBarInsideCard = controlBarInCard && !compact;

    const content = (
      <div
        className={cx('flex flex-col gap-2', cx(styles.container, expand && styles.fullscreen))}
        ref={slashMenuRef}
        style={{
          display: hidden ? 'none' : undefined,
          paddingBlock: expand ? 0 : showFootnote ? '0 12px' : '0 8px',
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ComposerBeam active={beamActive} fullscreen={expand}>
          <PromptInput
            className={cx(expand && 'flex h-full min-h-0 flex-1 flex-col')}
            data-testid="chat-input"
            style={inputContainerProps?.style}
            externalEditor={{
              onSubmit: (event) => {
                event.preventDefault();
                if (canUseResource && !isAccessLoading) handleSendButton();
              },
            }}
            // An empty draft disables Send, not the entire editable surface.
            // Override InputGroup's descendant-disabled wash for this composite control.
            groupClassName={cx(
              'h-auto flex-col overflow-visible rounded-[12px] border-border bg-card text-card-foreground shadow-sm has-disabled:bg-card has-disabled:opacity-100 dark:bg-card dark:has-disabled:bg-card',
              expand && 'min-h-0 flex-1 rounded-none',
              inputContainerProps?.className,
            )}
          >
            {(extentHeaderContent || showTypoBar || shouldShowContextContainer) && (
              <PromptInputHeader>
                <div className="flex w-full flex-col gap-0">
                  {extentHeaderContent}
                  {showTypoBar && <TypoBar />}
                  {contextContainerNode}
                </div>
              </PromptInputHeader>
            )}
            <PromptInputBody
              className={cx('block w-full overflow-y-auto px-3 py-2', expand && 'min-h-0 flex-1')}
              style={
                expand
                  ? undefined
                  : {
                      height: chatInputHeight || undefined,
                      maxHeight: inputContainerProps?.maxHeight ?? 320,
                      minHeight: inputContainerProps?.minHeight ?? 36,
                      resize: inputContainerProps?.resize === false ? undefined : 'vertical',
                    }
              }
              onPointerUp={(event) => {
                if (!expand && inputContainerProps?.resize !== false) {
                  updateSystemStatus({
                    chatInputHeight: Math.round(event.currentTarget.getBoundingClientRect().height),
                  });
                }
              }}
            >
              <InputEditor
                defaultRows={editorDefaultRows}
                initialContent={initialContent}
                placeholder={placeholder}
                placeholderVariant={placeholderVariant}
              />
            </PromptInputBody>
            {!compact && (
              <PromptInputFooter style={actionBarStyle}>
                <PromptInputTools className="flex-1">
                  {loadingLeftSlot ?? leftSlot}
                </PromptInputTools>
                <PromptInputTools className="shrink-0">
                  {loadingRightSlot ?? rightContent ?? (
                    <>
                      {sendAreaPrefix}
                      <SendArea hideContextWindow={hasControlBar} />
                    </>
                  )}
                </PromptInputTools>
              </PromptInputFooter>
            )}
            {controlBarInsideCard && controlBarNode ? (
              <PromptInputFooter className="pt-0">{controlBarNode}</PromptInputFooter>
            ) : null}
          </PromptInput>
        </ComposerBeam>
        {controlBarInsideCard ? null : controlBarNode}
        {showFootnote && !expand && (
          <div
            className="flex flex-col items-center justify-center"
            style={{ pointerEvents: 'none', zIndex: 100 }}
          >
            <div className={cn('text-muted-foreground', styles.footnote)}>
              {t('input.disclaimer')}
            </div>
          </div>
        )}
      </div>
    );

    if (expand && layoutContainerRef.current)
      return createPortal(content, layoutContainerRef.current);

    return content;
  },
);

DesktopChatInput.displayName = 'DesktopChatInput';

export default DesktopChatInput;
