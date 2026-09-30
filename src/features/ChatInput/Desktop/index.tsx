'use client';

import { type ChatInputProps } from '@lobehub/editor/react';
import { ChatInput, ChatInputActionBar } from '@lobehub/editor/react';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { type ReactNode, use } from 'react';
import { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import ChatInputNotice from '@/features/ChatInput/ChatInputNotice';
import ComposerExpandButton from '@/features/ChatInput/components/ComposerExpandButton';
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
  controlBarInCard: css`
    flex: none;
    padding-block-end: 4px;
    padding-inline: 4px;
  `,
  inputFullscreen: css`
    border: none;
    border-radius: 0 !important;
  `,
  leftActions: css`
    flex: none;
    min-width: 0;

    > * {
      flex: none !important;
    }
  `,
  leftSlot: css`
    overflow: hidden;
    flex: 1;
    min-width: 0;
  `,
}));

interface DesktopChatInputProps extends ActionToolbarProps {
  actionBarStyle?: React.CSSProperties;
  /**
   * Collapse the editor to a single bordered row by dropping the action bar footer.
   * Send still works through the Enter keybinding; the rest of the chrome
   * (control bar / footnote) is independently gated by `showControlBar` /
   * `showFootnote`. Defaults to false — other surfaces stay untouched.
   */
  compact?: boolean;
  /**
   * Render the control bar (or `controlBarSlot`) as the card's last footer row
   * instead of a sibling below it. The reference composer keeps its controls
   * inside the card border; surfaces that want a free-floating bar keep the
   * default off. In `compact` mode the footer is dropped entirely, so the bar
   * falls back to the sibling position.
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
    // The action bar is `width: 100%`, so a sibling placed *inside* its
    // shrink-to-fit box is pushed past the bar's right edge and leaves a
    // one-slot hole between the last action and the expand toggle. Keep the
    // toggle in a row outside that box.
    const leftSlotContent = (
      <div className="flex flex-row items-center flex-none gap-0.5">
        <div className={cx('flex flex-row items-center', styles.leftActions)}>
          {leftContent ?? (
            <ActionBar
              disableCollapse
              borderRadius={borderRadius}
              dropdownPlacement={dropdownPlacement}
              extraActionItems={extraActionItems}
            />
          )}
        </div>
        <ComposerExpandButton />
      </div>
    );
    const leftSlot = noticeNode ? (
      <div className={cx('flex flex-row items-center gap-1', styles.leftSlot)}>
        {leftSlotContent}
        {noticeNode}
      </div>
    ) : (
      leftSlotContent
    );

    // The control bar's home: a sibling under the card by default, or the
    // card's last footer row when the surface opts into `controlBarInCard`
    // (`compact` drops the footer, so the sibling position is kept there).
    const controlBarNode = controlBarSlot ?? (showControlBar && <ControlBar />);
    const controlBarInsideCard = controlBarInCard && !compact;

    const content = (
      <div
        className={cx('flex flex-col gap-2', cx(styles.container, expand && styles.fullscreen))}
        style={{
          display: hidden ? 'none' : undefined,
          paddingBlock: expand ? 0 : showFootnote ? '0 12px' : '0 8px',
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ChatInput
          data-testid="chat-input"
          defaultHeight={chatInputHeight || 32}
          fullscreen={expand}
          maxHeight={320}
          minHeight={36}
          resize={true}
          slashMenuRef={slashMenuRef}
          footer={
            compact ? undefined : (
              <>
                <ChatInputActionBar
                  left={loadingLeftSlot ?? leftSlot}
                  style={actionBarStyle ?? { paddingRight: 8 }}
                  right={
                    loadingRightSlot ??
                    rightContent ??
                    (sendAreaPrefix ? (
                      <div className="flex flex-row items-center gap-1.5">
                        {sendAreaPrefix}
                        <SendArea hideContextWindow={hasControlBar} />
                      </div>
                    ) : (
                      <SendArea hideContextWindow={hasControlBar} />
                    ))
                  }
                />
                {controlBarInsideCard && controlBarNode ? (
                  <div className={styles.controlBarInCard}>{controlBarNode}</div>
                ) : null}
              </>
            )
          }
          header={
            <div className="flex flex-col gap-0">
              {extentHeaderContent}
              {showTypoBar && <TypoBar />}
              {contextContainerNode}
            </div>
          }
          onSizeChange={(height) => {
            updateSystemStatus({ chatInputHeight: height });
          }}
          {...inputContainerProps}
          className={cx(expand && styles.inputFullscreen, inputContainerProps?.className)}
        >
          <InputEditor
            defaultRows={editorDefaultRows}
            initialContent={initialContent}
            placeholder={placeholder}
            placeholderVariant={placeholderVariant}
          />
        </ChatInput>
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
