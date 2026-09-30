import { Accordion } from '@/components/ui/accordion';

import Members from './Members';
import Topic from './Topic';

export enum ChatSidebarKey {
  Members = 'members',
  Topic = 'topic',
}

const Body = () => {
  return (
    <div className="flex flex-col px-1">
      <Accordion
        multiple
        defaultValue={[ChatSidebarKey.Members, ChatSidebarKey.Topic]}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <Members itemKey={ChatSidebarKey.Members} />
        <Topic itemKey={ChatSidebarKey.Topic} />
      </Accordion>
    </div>
  );
};

export default Body;
