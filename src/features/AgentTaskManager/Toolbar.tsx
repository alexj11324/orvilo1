import { Clock3Icon, PanelRightCloseIcon, PlusIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import NavHeader from '@/features/NavHeader';
import TopicItem from '@/features/PageEditor/Copilot/TopicSelector/TopicItem';
import { useFetchAgentChatTopics } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';
import { useGlobalStore } from '@/store/global';

const Toolbar = memo(() => {
  const { t } = useTranslation('topic');
  const [topicPopoverOpen, setTopicPopoverOpen] = useState(false);
  const agentId = useConversationStore(conversationSelectors.agentId);

  useFetchAgentChatTopics(agentId);

  const [activeTopicId, switchTopic, topics] = useChatStore((s) => [
    s.activeTopicId,
    s.switchTopic,
    // The panel names its own agent — `currentTopics` resolves the workspace
    // conversation feed now, which is not this panel's list.
    topicSelectors.getTopicsByAgentId(agentId)(s),
  ]);
  const currentTopic = useChatStore(topicSelectors.currentActiveTopic);

  const toggleTaskAgentPanel = useGlobalStore((s) => s.toggleTaskAgentPanel);

  const isLoadingTopics = topics === undefined;
  const topicTitle = currentTopic?.title || t('title');
  const hasTopics = !!topics && topics.length > 0;

  const handleCreate = () => {
    switchTopic(null, { scope: 'task' });
  };

  return (
    <NavHeader
      showTogglePanelButton={false}
      left={
        <div
          className="text-muted-foreground truncate block"
          style={{ fontSize: 14, fontWeight: 500, marginLeft: 8 }}
          title={topicTitle}
        >
          {topicTitle}
        </div>
      }
      right={
        <>
          <ActionIcon
            icon={PlusIcon}
            size={DESKTOP_HEADER_ICON_SMALL_SIZE}
            title={t('actions.addNewTopic')}
            onClick={handleCreate}
          />
          <Popover
            open={isLoadingTopics ? false : topicPopoverOpen}
            onOpenChange={setTopicPopoverOpen}
          >
            <PopoverTrigger
              render={
                <ActionIcon
                  disabled={isLoadingTopics}
                  icon={Clock3Icon}
                  loading={isLoadingTopics}
                  size={DESKTOP_HEADER_ICON_SMALL_SIZE}
                  title={t('actions.showTopics')}
                />
              }
            />
            <PopoverContent align={'end'} className="w-60 p-0">
              {hasTopics ? (
                <div
                  className="flex flex-col gap-1 p-2"
                  style={{
                    maxHeight: '50vh',
                    overflowY: 'auto',
                    width: '100%',
                  }}
                >
                  {topics!.map((topic) => (
                    <TopicItem
                      active={topic.id === activeTopicId}
                      key={topic.id}
                      topicId={topic.id}
                      topicTitle={topic.title}
                      onClose={() => setTopicPopoverOpen(false)}
                      onTopicChange={(id) => switchTopic(id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <div className="text-muted-foreground">{t('temp')}</div>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <ActionIcon
            icon={PanelRightCloseIcon}
            size={DESKTOP_HEADER_ICON_SMALL_SIZE}
            title={t('workingPanel.tabs.closePanel', { ns: 'chat' })}
            onClick={() => toggleTaskAgentPanel()}
          />
        </>
      }
    />
  );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
