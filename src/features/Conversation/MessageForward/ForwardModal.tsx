'use client';

import { agentDisplayName, type StoreApiWithSelector } from '@orvilo/types';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { t as translate } from 'i18next';
import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { getForwardedMessageText } from '@/store/chat/slices/forward/helpers';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import {
  contextSelectors,
  type ConversationStore,
  messageStateSelectors,
  Provider,
  useConversationStore,
} from '../store';
import SelectCircle from './SelectCircle';
import { type ForwardTarget, useForwardMessages } from './useForwardMessages';

const styles = {
  body: '[block-size:460px]',
  divider: 'self-stretch [inline-size:1px] bg-sidebar-border',
  list: 'flex-1 overflow-y-auto -mx-1 px-1',
  preview:
    'overflow-hidden border border-sidebar-border rounded-(--ant-border-radius-lg) bg-[var(--ant-color-fill-quaternary)]',
  previewLines: 'flex-1 overflow-y-auto p-3',
  note: 'bg-transparent dark:bg-transparent disabled:bg-transparent dark:disabled:bg-transparent',
  noteDivider: '[block-size:1px] bg-sidebar-border',
  previewLine: 'truncate text-[12px] text-muted-foreground',
  previewMore: '[padding-block-start:2px] text-[12px] text-[var(--ant-color-text-tertiary)]',
  row: 'cursor-pointer [min-block-size:44px] px-2 py-1.5 rounded-(--ant-border-radius-lg) transition-[background-color] duration-100 ease-[var(--ant-motion-ease-in-out)] hover:bg-accent',
  rowSelected: 'bg-[var(--ant-color-fill-quaternary)]',
};

const ForwardModalContent = memo(() => {
  const { t } = useTranslation('chat');
  const { close } = useModalContext();
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const currentAgentId = useConversationStore(contextSelectors.agentId);
  const agents = useHomeStore(homeAgentListSelectors.allAgents);
  const forwardMessages = useForwardMessages();

  // What's being forwarded — count + a few role-labelled snippets for the panel.
  const preview = useConversationStore((s) => {
    const msgs = messageStateSelectors.forwardableSelectedMessages(s);
    return {
      count: msgs.length,
      lines: msgs.slice(0, 6).map((m) => ({
        role: m.role === 'user' ? t('messageForward.role.user') : t('messageForward.role.agent'),
        text: getForwardedMessageText(m).replaceAll(/\s+/g, ' ').slice(0, 60),
      })),
    };
  }, isEqual);

  useFetchAgentList();

  const candidates = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    return agents
      .filter((agent) => agent.type === 'agent' && agent.id !== currentAgentId)
      .filter(
        (agent) => !trimmed || (agentDisplayName(agent) ?? '').toLowerCase().includes(trimmed),
      );
  }, [agents, currentAgentId, keyword]);

  const selectedAgents = useMemo(
    () =>
      selectedIds
        .map((id) => agents.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => !!a),
    [selectedIds, agents],
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleForward = () => {
    const targets: ForwardTarget[] = selectedAgents.map((a) => ({ id: a.id, title: a.title }));
    if (targets.length === 0) return;
    forwardMessages(targets, note);
    close();
  };

  return (
    <div className={cn('flex gap-4', styles.body)}>
      {/* Left: searchable multi-select agent list */}
      <div className="flex flex-col flex-1 gap-2" style={{ minWidth: 0 }}>
        <div className="relative">
          <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-2 size-4 text-muted-foreground" />
          <Input
            className="px-8"
            placeholder={t('messageForward.modal.searchPlaceholder')}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          {keyword && (
            <Button
              aria-label={t('clearSearch', { ns: 'common' })}
              className="-translate-y-1/2 absolute top-1/2 right-1 text-muted-foreground"
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={() => setKeyword('')}
            >
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
        <div className={cn('flex flex-col gap-1', styles.list)}>
          {candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6">
              <div className="text-muted-foreground">{t('messageForward.modal.empty')}</div>
            </div>
          ) : (
            candidates.map((agent) => {
              const checked = selectedIds.includes(agent.id);
              return (
                <div
                  {...clickableProps()}
                  key={agent.id}
                  className={cn(
                    cn('flex items-center gap-2', cn(styles.row, checked && styles.rowSelected)),
                    CLICKABLE_FOCUS_RING,
                  )}
                  onClick={() => toggle(agent.id)}
                >
                  <SelectCircle checked={checked} />
                  <AgentRuntimeIcon size={22} type={agent.heterogeneousType || 'orvilo'} />
                  <div className="truncate" style={{ flex: 1 }}>
                    {agentDisplayName(agent, t('untitledAgent'))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.divider} />

      {/* Right: forwarded content preview + note */}
      <div className="flex flex-col flex-1 gap-2" style={{ minWidth: 0 }}>
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {t('messageForward.transcript.header', { count: preview.count })}
        </div>
        <div className={cn('flex flex-col flex-1', styles.preview)}>
          <div className={cn('flex flex-col flex-1 gap-1', styles.previewLines)}>
            {preview.lines.map((line, i) => (
              <div className={styles.previewLine} key={i}>
                <div className="font-semibold" style={{ fontSize: 12 }}>
                  {line.role}:
                </div>{' '}
                {line.text}
              </div>
            ))}
            {preview.count > preview.lines.length && (
              <div className={styles.previewMore}>
                {t('messageForward.modal.moreMessages', {
                  count: preview.count - preview.lines.length,
                })}
              </div>
            )}
          </div>
          <div className={styles.noteDivider} />
          <Textarea
            className={styles.note}
            placeholder={t('messageForward.modal.notePlaceholder')}
            rows={2}
            style={{ maxHeight: '4lh', resize: 'none' }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={close}>{t('messageForward.bar.cancel')}</Button>
          <Button disabled={selectedIds.length === 0} variant="default" onClick={handleForward}>
            {selectedIds.length > 0
              ? t('messageForward.modal.sendCount', { count: selectedIds.length })
              : t('messageForward.bar.forward')}
          </Button>
        </div>
      </div>
    </div>
  );
});

ForwardModalContent.displayName = 'ForwardModalContent';

interface OpenForwardModalOptions {
  /**
   * The conversation store is context-scoped, and the modal renders in the
   * global `ModalHost` tree — hand the live store api back so selection state
   * and `exitSelectionMode` stay wired to the conversation that opened it.
   */
  createConversationStore: () => StoreApiWithSelector<ConversationStore>;
  onClosed?: () => void;
}

export const openForwardModal = ({ createConversationStore, onClosed }: OpenForwardModalOptions) =>
  createModal({
    content: (
      <Provider createStore={createConversationStore}>
        <ForwardModalContent />
      </Provider>
    ),
    footer: null,
    // NOT `onOpenChange`: that skips `instance.close()`, which is how the
    // in-content Cancel and Forward buttons close this modal.
    onOpenChangeComplete: (open) => {
      if (!open) onClosed?.();
    },
    title: translate('messageForward.modal.title', { ns: 'chat' }),
    width: 760,
  });
