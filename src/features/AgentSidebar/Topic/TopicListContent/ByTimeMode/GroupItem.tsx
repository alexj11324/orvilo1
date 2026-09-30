import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import isEqual from 'fast-deep-equal';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import TopicItem from '../../List/Item';
import { type GroupItemComponentProps } from '../GroupedAccordion';

const preformat = (id: string) =>
  id.startsWith('20') ? (id.includes('-') ? dayjs(id).format('MMMM') : id) : undefined;

const GroupItem = memo<GroupItemComponentProps>(({ group }) => {
  const { t } = useTranslation('topic');
  const { id, title, children } = group;

  const timeTitle = useMemo(() => preformat(id) ?? t(`groupTitle.byTime.${id}` as any), [id, t]);

  return (
    <AccordionItem value={id}>
      <AccordionHeader>
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
          <div className="flex items-center gap-1.5 h-[24px]" style={{ overflow: 'hidden' }}>
            <Text ellipsis fontSize={12} style={{ flex: 1 }} type={'secondary'} weight={500}>
              {title || timeTitle}
            </Text>
          </div>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel contentStyle={{ padding: 0 }}>
        <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
          {children.map((topic) => (
            <TopicItem
              fav={topic.favorite}
              id={topic.id}
              key={topic.id}
              metadata={topic.metadata}
              status={topic.status}
              title={topic.title}
              userId={topic.userId}
            />
          ))}
        </div>
      </AccordionPanel>
    </AccordionItem>
  );
}, isEqual);

GroupItem.displayName = 'TopicByTimeGroupItem';

export default GroupItem;
