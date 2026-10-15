import { Clock3Icon, PlusIcon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Badge } from '@/components/reui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NavHeader from '@/features/NavHeader';
import { useFetchAgentChatTopics } from '@/hooks/useFetchChatTopics';
import { useQueryState } from '@/hooks/useQueryParam';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';

const styles = {
  tag: 'overflow-hidden min-w-0 text-xs leading-5 h-auto',
  title: 'overflow-hidden text-ellipsis whitespace-nowrap',
};

interface TopicSelectorProps {
  agentId: string;
  disabled?: boolean;
}

const TopicSelector = memo<TopicSelectorProps>(({ agentId, disabled }) => {
  const { t } = useTranslation('topic');

  // Fetch topics for the group agent builder
  useFetchAgentChatTopics(agentId);

  // Use activeTopicId from chatStore (synced from URL query 'bt' via ProfileHydration)
  const activeTopicId = useChatStore((s) => s.activeTopicId);
  const topics = useChatStore((s) => topicSelectors.getTopicsByAgentId(agentId)(s));

  // Directly update URL query 'bt' to switch topic in profile page
  const [, setBuilderTopicId] = useQueryState('bt');

  const handleSwitchTopic = useCallback(
    (topicId?: string) => {
      setBuilderTopicId(topicId ?? null);
    },
    [setBuilderTopicId],
  );

  // Find active topic from the agent's topics list directly
  const activeTopic = useMemo(
    () => topics?.find((topic) => topic.id === activeTopicId),
    [topics, activeTopicId],
  );

  const items = useMemo(
    () =>
      (topics || []).map((topic) => ({
        checked: topic.id === activeTopicId,
        key: topic.id,
        label: topic.title,
        onCheckedChange: (checked: boolean) => {
          if (disabled) return;
          if (checked) {
            handleSwitchTopic(topic.id);
          }
        },
      })),
    [topics, handleSwitchTopic, activeTopicId, disabled],
  );
  const isEmpty = !topics || topics.length === 0;

  return (
    <NavHeader
      slotClassNames={{ right: 'flex-none' }}
      left={
        activeTopic?.title ? (
          <Badge className={styles.tag} variant="primary-light">
            <span className={styles.title} title={activeTopic.title}>
              {activeTopic.title}
            </span>
          </Badge>
        ) : undefined
      }
      right={
        <>
          <ActionIcon
            disabled={disabled}
            icon={PlusIcon}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('actions.addNewTopic')}
            onClick={() => {
              if (disabled) return;

              handleSwitchTopic(undefined);
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={disabled || isEmpty}
              render={
                <ActionIcon
                  aria-label={t('actions.recentTopics')}
                  disabled={disabled || isEmpty}
                  icon={Clock3Icon}
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                />
              }
            />
            <DropdownMenuContent
              align="end"
              className="max-h-150 min-w-50 overflow-y-auto"
              side="bottom"
            >
              {items.map((item) => (
                <DropdownMenuCheckboxItem
                  closeOnClick
                  checked={item.checked}
                  key={item.key}
                  onCheckedChange={item.onCheckedChange}
                >
                  {item.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );
});

TopicSelector.displayName = 'TopicSelector';

export default TopicSelector;
