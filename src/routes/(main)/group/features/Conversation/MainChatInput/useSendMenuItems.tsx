'use client';

import { HotkeyEnum, KeyEnum } from '@orvilo/const/hotkeys';
import { BotMessageSquare, LucideCheck, MessageSquarePlus } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import type { ActionDropdownMenuItems } from '@/features/ChatInput/ActionBar/components/ActionDropdown';
import { useConversationStore, useConversationStoreApi } from '@/features/Conversation';
import { useUserStore } from '@/store/user';
import { preferenceSelectors, settingsSelectors } from '@/store/user/selectors';

/**
 * useSendMenuItems hook for ConversationStore
 *
 * Provides send menu items for:
 * - Send with Enter / Cmd+Enter toggle
 * - Add AI Message
 * - Add User Message
 */
export const useSendMenuItems = (): ActionDropdownMenuItems => {
  const { t } = useTranslation('chat');

  const storeApi = useConversationStoreApi();
  const editor = useConversationStore((s) => s.editor);

  const [useCmdEnterToSend, updatePreference] = useUserStore((s) => [
    preferenceSelectors.useCmdEnterToSend(s),
    s.updatePreference,
  ]);

  const hotkey = useUserStore(settingsSelectors.getHotkeyById(HotkeyEnum.AddUserMessage));

  const handleAddAIMessage = useCallback(() => {
    const store = storeApi.getState();
    const message = editor?.getMarkdownContent() ?? store.inputMessage;
    store.addAIMessage(message);
    // Clear and focus editor
    editor?.clearContent();
    editor?.focus();
  }, [storeApi, editor]);

  const handleAddUserMessage = useCallback(() => {
    const store = storeApi.getState();
    const message = store.inputMessage;
    if (!message.trim()) return;

    store.addUserMessage({ message });
    // Clear and focus editor
    editor?.clearContent();
    editor?.focus();
  }, [storeApi, editor]);

  return useMemo(
    () => [
      {
        icon: !useCmdEnterToSend ? <LucideCheck /> : <div />,
        key: 'sendWithEnter',
        label: (
          <div className="flex items-center gap-1">
            <Trans
              i18nKey={'input.sendWithEnter'}
              ns={'chat'}
              components={{
                key: <Kbd>{KeyEnum.Enter}</Kbd>,
              }}
            />
          </div>
        ),
        onClick: () => {
          updatePreference({ useCmdEnterToSend: false });
        },
      },
      {
        icon: useCmdEnterToSend ? <LucideCheck /> : <div />,
        key: 'sendWithCmdEnter',
        label: (
          <div className="flex items-center gap-1">
            <Trans
              i18nKey={'input.sendWithCmdEnter'}
              ns={'chat'}
              components={{
                key: (
                  <KbdGroup>
                    <Kbd>{KeyEnum.Mod}</Kbd>
                    <Kbd>{KeyEnum.Enter}</Kbd>
                  </KbdGroup>
                ),
              }}
            />
          </div>
        ),
        onClick: () => {
          updatePreference({ useCmdEnterToSend: true });
        },
      },
      { type: 'divider' },
      {
        icon: <BotMessageSquare />,
        key: 'addAi',
        label: t('input.addAi'),
        onClick: handleAddAIMessage,
      },
      {
        icon: <MessageSquarePlus />,
        key: 'addUser',
        label: (
          <div className="flex items-center gap-6">
            {t('input.addUser')}
            <Kbd>{hotkey}</Kbd>
          </div>
        ),
        onClick: handleAddUserMessage,
      },
    ],
    [useCmdEnterToSend, updatePreference, hotkey, handleAddAIMessage, handleAddUserMessage],
  );
};
