import { ActionIcon } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import { Clock3Icon, PlusIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import NavHeader from '@/features/NavHeader';
import { useFetchAgentChatTopics } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  time: css`
    margin-inline-start: 6px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

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
            : dayjs(topic.updatedAt).format('YYYY-MM-DD');

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
            <div className="flex items-center gap-1 justify-between" style={{ width: '100%' }}>
              <span className={styles.title}>{topic.title}</span>
              <span className={styles.time}>{displayTime}</span>
            </div>
          </DropdownMenuCheckboxItem>
        );
      }),
    [topics, switchTopic, styles, activeTopicId, disabled],
  );
  const isEmpty = !topics || topics.length === 0;

  return (
    <NavHeader
      showTogglePanelButton={false}
      styles={{ right: { flex: 'none' } }}
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
            size={DESKTOP_HEADER_ICON_SMALL_SIZE}
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
                <span style={{ display: 'inline-flex' }}>
                  <ActionIcon
                    disabled={disabled || isEmpty}
                    icon={Clock3Icon}
                    size={DESKTOP_HEADER_ICON_SMALL_SIZE}
                  />
                </span>
              }
            />
            <DropdownMenuContent
              align="end"
              side="bottom"
              style={{ maxHeight: 400, minWidth: 280, overflowY: 'auto' }}
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
