import TopicListContent from '@/features/AgentSidebar/Topic/TopicListContent';
import TopicSearchBar from '@/features/AgentSidebar/Topic/TopicSearchBar';

import TopicModal from './features/TopicModal';

const Topic = () => {
  return (
    <TopicModal>
      <div
        className="flex flex-col gap-2"
        style={{ height: '100%', padding: '8px 8px 0', overflow: 'hidden' }}
      >
        <TopicSearchBar />
        <div
          className="flex flex-col"
          style={{
            height: '100%',
            width: 'calc(100% + 16px)',
            marginInline: -8,
            overflowX: 'hidden',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          <TopicListContent />
        </div>
      </div>
    </TopicModal>
  );
};

export default Topic;
