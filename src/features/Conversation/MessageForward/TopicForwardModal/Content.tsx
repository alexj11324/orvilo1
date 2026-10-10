'use client';

import { cn } from 'cn';
import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import SelectCircle from '../SelectCircle';
import type { ForwardTarget } from '../useForwardMessages';
import { useForwardTopic } from '../useForwardTopic';

const styles = {
  body: '[block-size:460px]',
  context:
    'flex-1 p-3 border border-sidebar-border rounded-(--ant-border-radius-lg) bg-[var(--ant-color-fill-quaternary)]',
  divider: 'self-stretch [inline-size:1px] bg-sidebar-border',
  list: 'flex-1 overflow-y-auto',
  row: 'cursor-pointer [min-block-size:44px] px-2 py-1.5 rounded-(--ant-border-radius-lg) hover:bg-accent',
  selected: 'bg-[var(--ant-color-fill-quaternary)]',
};

export interface TopicForwardContentProps {
  sourceAgentId: string;
  topicId: string;
  topicTitle: string;
}

export const TopicForwardContent = ({
  sourceAgentId,
  topicId,
  topicTitle,
}: TopicForwardContentProps) => {
  const { t } = useTranslation('chat');
  const { close } = useModalContext();
  const [keyword, setKeyword] = useState('');
  const [note, setNote] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const agents = useHomeStore(homeAgentListSelectors.allAgents);
  const forwardTopic = useForwardTopic({ agentId: sourceAgentId, topicId });

  useFetchAgentList();

  const candidates = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return agents
      .filter((agent) => agent.type === 'agent' && agent.id !== sourceAgentId)
      .filter((agent) => !query || (agent.title || '').toLowerCase().includes(query));
  }, [agents, keyword, sourceAgentId]);

  const handleForward = () => {
    const targets: ForwardTarget[] = selectedIds
      .map((id) => agents.find((agent) => agent.id === id))
      .filter((agent): agent is NonNullable<typeof agent> => !!agent)
      .map((agent) => ({ id: agent.id, title: agent.title }));
    if (targets.length === 0) return;

    forwardTopic(targets, note);
    close();
  };

  return (
    <div className={cn('flex gap-4', styles.body)}>
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
              const selected = selectedIds.includes(agent.id);
              return (
                <div
                  {...clickableProps()}
                  key={agent.id}
                  className={cn(
                    cn('flex items-center gap-2', cn(styles.row, selected && styles.selected)),
                    CLICKABLE_FOCUS_RING,
                  )}
                  onClick={() =>
                    setSelectedIds((ids) =>
                      selected ? ids.filter((id) => id !== agent.id) : [...ids, agent.id],
                    )
                  }
                >
                  <AgentRuntimeIcon size={22} type={agent.heterogeneousType || 'orvilo'} />
                  <div className="truncate" style={{ flex: 1 }}>
                    {agent.title || t('untitledAgent')}
                  </div>
                  <SelectCircle checked={selected} />
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.divider} />

      <div className="flex flex-col flex-1 gap-3" style={{ minWidth: 0 }}>
        <div className="text-muted-foreground">{t('messageForward.topic.context')}</div>
        <div className={cn('flex flex-col gap-2', styles.context)}>
          <div className="truncate font-semibold">{topicTitle}</div>
          <div className="text-muted-foreground">{t('messageForward.topic.description')}</div>
        </div>
        <Textarea
          placeholder={t('messageForward.modal.notePlaceholder')}
          rows={2}
          style={{ maxHeight: '4lh', resize: 'none' }}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
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
};
