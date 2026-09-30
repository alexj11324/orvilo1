import { AccordionRoot } from '@lobehub/ui/base-ui';

import Members from './Members';
import Topic from './Topic';

export enum ChatSidebarKey {
  Members = 'members',
  Topic = 'topic',
}

const Body = () => {
  return (
    <div className="flex flex-col px-1">
      <AccordionRoot
        defaultValue={[ChatSidebarKey.Members, ChatSidebarKey.Topic]}
        indicatorPlacement="inline"
        style={{ gap: 8 }}
      >
        <Members itemKey={ChatSidebarKey.Members} />
        <Topic itemKey={ChatSidebarKey.Topic} />
      </AccordionRoot>
    </div>
  );
};

export default Body;
