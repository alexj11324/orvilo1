import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type GroupedTopic } from '@/types/topic';

import TopicItem from '../../List/Item';

const preformat = (id: string) =>
  id.startsWith('20') ? (id.includes('-') ? dayjs(id).format('MMMM') : id) : undefined;

interface GroupItemProps {
  activeThreadId?: string;
  activeTopicId?: string;
  group: GroupedTopic;
}

const GroupItem = memo<GroupItemProps>(({ group, activeTopicId, activeThreadId }) => {
  const { t } = useTranslation('topic');
  const { id, title, children } = group;

  const timeTitle = useMemo(() => preformat(id) ?? t(`groupTitle.byTime.${id}` as any), [id, t]);

  return (
    <AccordionItem value={id}>
      <AccordionHeader>
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
          <div className="flex items-center gap-1.5" style={{ height: 24, overflow: 'hidden' }}>
            <Text ellipsis fontSize={12} style={{ flex: 1 }} type={'secondary'} weight={500}>
              {title || timeTitle}
            </Text>
          </div>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel contentStyle={{ padding: 0 }}>
        <div className="flex flex-col" style={{ gap: 1, paddingBlock: 1 }}>
          {children.map((topic) => (
            <TopicItem
              active={activeTopicId === topic.id}
              fav={topic.favorite}
              id={topic.id}
              key={topic.id}
              status={topic.status}
              threadId={activeThreadId}
              title={topic.title}
              userId={topic.userId}
            />
          ))}
        </div>
      </AccordionPanel>
    </AccordionItem>
  );
});

export default GroupItem;
