'use client';

import { type IEditor } from '@lobehub/editor';
import { HIDE_TOOLBAR_COMMAND } from '@lobehub/editor';
import { type ChatInputActionsProps } from '@lobehub/editor/react';
import { nanoid } from '@orvilo/utils';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { useConversationStore } from '@/features/Conversation/store';
import type { ComposerTarget } from '@/features/Conversation/types';
import { useFileStore } from '@/store/file';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { usePageAgentPanelControl } from '../RightPanel/OverrideContext';
import { usePageEditorStore } from '../store';

const styles = createStaticStyles(({ css }) => ({
  askCopilot: css`
    border-radius: 6px;
    color: ${cssVar.colorTextDescription};

    &:hover {
      color: ${cssVar.colorTextSecondary};
    }
  `,
}));

export const useAskCopilotItem = (
  editor: IEditor | undefined,
  explicitComposerTarget?: ComposerTarget,
): ChatInputActionsProps['items'] => {
  const { t } = useTranslation('common');
  const providerComposerTarget = useConversationStore((s) => s.composerTarget);
  const composerTarget = explicitComposerTarget ?? providerComposerTarget;
  const addSelectionContext = useFileStore((s) => s.addChatContextSelection);
  const pageId = usePageEditorStore((s) => s.documentId);
  const setRightPanelMode = usePageEditorStore((s) => s.setRightPanelMode);
  const { toggle: togglePageAgentPanel } = usePageAgentPanelControl();

  return useMemo(() => {
    if (!editor || !composerTarget.writable) return [];

    const label = t('cmdk.askOrviloAI');

    return [
      {
        children: (
          <div
            {...clickableProps()}
            style={{ cursor: 'pointer' }}
            className={cn(
              cn('flex items-center gap-2 py-1.5 px-3', styles.askCopilot),
              CLICKABLE_FOCUS_RING,
            )}
            onClick={() => {
              const xml = (editor.getSelectionDocument?.('litexml') as string) || '';
              const plainText = (editor.getSelectionDocument?.('text') as string) || '';
              const content = xml.trim() || plainText.trim();

              if (!content) return;

              const format = xml.trim() ? 'xml' : 'text';
              const preview =
                (plainText || xml)
                  .replaceAll(/<[^>]*>/g, ' ')
                  .replaceAll(/\s+/g, ' ')
                  .trim() || undefined;

              // Store action handles deduplication
              addSelectionContext({
                contextKey: composerTarget.contextKey,
                selection: {
                  content,
                  format,
                  id: `selection-${nanoid(6)}`,
                  pageId,
                  preview,
                  title: 'Selection',
                  type: 'text',
                },
              });

              // Open right panel if not opened
              setRightPanelMode('copilot');
              togglePageAgentPanel(true);

              // Focus on chat input after a short delay to ensure panel is opened
              setTimeout(() => {
                // Find the chat input editor within the right panel
                // Query all lexical editors and get the last one (which should be the chat input)
                const allEditors = [...document.querySelectorAll('[data-lexical-editor="true"]')];
                const chatInputEditor = allEditors.at(-1) as HTMLElement;
                if (chatInputEditor) {
                  chatInputEditor.focus();
                }
              }, 300);

              editor.dispatchCommand(HIDE_TOOLBAR_COMMAND, undefined);
              editor.blur();
            }}
          >
            <AgentRuntimeIcon size={16} type="orvilo" />
            <span>{label}</span>
          </div>
        ),
        key: 'ask-copilot',
        label,
        onClick: () => {},
      },
    ];
  }, [
    addSelectionContext,
    composerTarget,
    editor,
    pageId,
    setRightPanelMode,
    t,
    togglePageAgentPanel,
  ]);
};
