import { formatAbsoluteDate } from '@orvilo/utils/time';
import dayjs from 'dayjs';
import { Clock3Icon, PlusIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NavHeader from '@/features/NavHeader';
import { useFetchAgentChatTopics } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';

const styles = {
  time: 'ms-1.5 text-xs leading-5 text-foreground-tertiary',
  title: 'truncate text-sm leading-5.5 font-medium',
};

// Topic creation and history share the builder's compact work header.
const topicActionSize = {
  blockSize: 32,
  borderRadius: 'var(--radius-button)',
  size: 16,
};

interface TopicSelectorProps {
  agentId: string;
  disabled?: boolean;
}

const TopicSelector = memo<TopicSelectorProps>(({ agentId, disabled }) => {
  const { t } = useTranslation('topic');

  // Fetch topics for the agent builder
  useFetchAgentChatTopics(agentId);

  const [activeTopicId, switchTopic, topics] = useChatStore((s) => [
    s.activeTopicId,
    s.switchTopic,
    topicSelectors.getTopicsByAgentId(agentId)(s),
  ]);

  // Find active topic from the agent's topics list directly
  const activeTopic = useMemo(
    () => topics?.find((topic) => topic.id === activeTopicId),
    [topics, activeTopicId],
  );

  const items = useMemo(
    () =>
      (topics || []).map((topic) => {
        const displayTime =
          dayjs().diff(dayjs(topic.updatedAt), 'd') < 7
            ? dayjs(topic.updatedAt).fromNow()
            : formatAbsoluteDate(topic.updatedAt);

        return (
          <DropdownMenuCheckboxItem
            checked={topic.id === activeTopicId}
            key={topic.id}
            onCheckedChange={(checked) => {
              if (disabled) return;
              if (checked) {
                switchTopic(topic.id);
              }
            }}
          >
            <div className="flex w-full items-center gap-1 justify-between">
              <span className={styles.title}>{topic.title}</span>
              <span className={styles.time}>{displayTime}</span>
            </div>
          </DropdownMenuCheckboxItem>
        );
      }),
    [topics, switchTopic, activeTopicId, disabled],
  );
  const isEmpty = !topics || topics.length === 0;

  return (
    <NavHeader
      showTogglePanelButton={false}
      slotClassNames={{ right: 'flex-none' }}
      left={
        activeTopic?.title ? (
          <span className={styles.title} title={activeTopic.title}>
            {activeTopic.title}
          </span>
        ) : undefined
      }
      right={
        <>
          <ActionIcon
            disabled={disabled}
            icon={PlusIcon}
            size={topicActionSize}
            title={t('actions.addNewTopic')}
            onClick={() => {
              if (disabled) return;

              switchTopic();
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={disabled || isEmpty}
              render={
                <span className="inline-flex">
                  <ActionIcon
                    aria-label={t('history', { ns: 'common' })}
                    disabled={disabled || isEmpty}
                    icon={Clock3Icon}
                    size={topicActionSize}
                  />
                </span>
              }
            />
            <DropdownMenuContent
              align="end"
              className="max-h-100 min-w-70 overflow-y-auto"
              side="bottom"
            >
              {items}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );
});

TopicSelector.displayName = 'TopicSelector';

export default TopicSelector;
