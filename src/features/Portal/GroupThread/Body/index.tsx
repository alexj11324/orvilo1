'use client';

import ThreadChatList from './ThreadChatList';

const Body = () => {
  return (
    <div className="flex flex-col h-[100%]">
      <div className="flex flex-col flex-1" style={{ overflow: 'hidden', position: 'relative' }}>
        <ThreadChatList />
      </div>
    </div>
  );
};

export default Body;
