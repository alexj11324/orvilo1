import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import {
  type ExecutionStatusVisual,
  TOPIC_GROUP_VISUALS,
  TOPIC_STATUS_VISUALS,
} from '@/components/ExecutionStatus';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import { accordionStyles } from '../../accordionStyles';
import TopicItem from '../../List/Item';
import { type GroupItemComponentProps } from '../GroupedAccordion';

// Status-group ids map 1:1 to a topic status except the synthetic `favorite`
// and `pending` buckets — all visuals come from the shared execution-status
// set so group headers, topic rows and task surfaces stay consistent.
const STATUS_ICON: Record<string, ExecutionStatusVisual> = {
  ...TOPIC_STATUS_VISUALS,
  ...TOPIC_GROUP_VISUALS,
};

const GroupItem = memo<GroupItemComponentProps>(({ group }) => {
  const { id, title, children } = group;
  const statusIcon = STATUS_ICON[id];

  return (
    <AccordionItem className={accordionStyles.item} value={id}>
      <AccordionTrigger
        className={accordionStyles.trigger}
        style={{ paddingBlock: 4, paddingInline: 8 }}
      >
        <div className="flex items-center gap-1.5 h-[24px]" style={{ overflow: 'hidden' }}>
          {statusIcon && (
            <div className="flex flex-col items-center justify-center flex-none h-[16px] w-[16px]">
              <statusIcon.icon color={statusIcon.color} size={13} />
            </div>
          )}
          <div
            className="truncate text-[12px] text-muted-foreground font-medium"
            style={{ flex: 1 }}
          >
            {title}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-0">
        <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
          {children.map((topic) => (
            <TopicItem
              showWorkingDirectory
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

GroupItem.displayName = 'TopicByStatusGroupItem';

export default GroupItem;
