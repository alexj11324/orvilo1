import { Suspense } from 'react';

import SkeletonList from './SkeletonList';
import TopicListContent from './TopicListContent';

const Home = () => {
  return (
    <Suspense fallback={<SkeletonList />}>
      <TopicListContent />
    </Suspense>
  );
};

export default Home;
