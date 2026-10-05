import dayjs from 'dayjs';
import isEqual from 'fast-deep-equal';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import { accordionStyles } from '../../accordionStyles';
import TopicItem from '../../List/Item';
import { type GroupItemComponentProps } from '../GroupedAccordion';

const preformat = (id: string) =>
  id.startsWith('20') ? (id.includes('-') ? dayjs(id).format('MMMM') : id) : undefined;

const GroupItem = memo<GroupItemComponentProps>(({ group }) => {
  const { t } = useTranslation('topic');
  const { id, title, children } = group;

  const timeTitle = useMemo(() => preformat(id) ?? t(`groupTitle.byTime.${id}` as any), [id, t]);

  return (
    <AccordionItem className={accordionStyles.item} value={id}>
      <AccordionTrigger
        className={accordionStyles.trigger}
        style={{ paddingBlock: 4, paddingInline: 8 }}
      >
        <div className="flex items-center gap-1.5 h-[24px]" style={{ overflow: 'hidden' }}>
          <div
            className="truncate text-[12px] text-muted-foreground font-medium"
            style={{ flex: 1 }}
          >
            {title || timeTitle}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-0">
        <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
          {children.map((topic) => (
            <TopicItem
              agentId={topic.agentId}
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
      </AccordionContent>
    </AccordionItem>
  );
}, isEqual);

GroupItem.displayName = 'TopicByTimeGroupItem';

export default GroupItem;
