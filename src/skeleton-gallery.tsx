import { ThemeProvider } from '@lobehub/ui';
import { type ReactNode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { ArticleSkeleton } from '@/components/Skeleton';
import ConversationListSkeleton from '@/components/Skeleton/Conversation/List';
import TaskItemSkeleton from '@/features/AgentTasks/AgentTaskList/TaskItemSkeleton';
import { BriefCardSkeleton } from '@/features/DailyBrief/BriefCardSkeleton';
import MemoryDetailLoading from '@/routes/(main)/memory/features/DetailLoading';
import MemoryLoading from '@/routes/(main)/memory/features/Loading';

const Case = ({ children, title }: { children: ReactNode; title: string }) => (
  <div
    className="flex flex-col gap-3 w-full"
    style={{ borderBottom: '1px solid #eee', padding: 24 }}
  >
    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5 }}>{title}</div>
    <Suspense fallback={null}>{children}</Suspense>
  </div>
);

createRoot(document.querySelector('#root')!).render(
  <ThemeProvider>
    <div className="flex flex-col w-full" style={{ margin: '0 auto', maxWidth: 900 }}>
      <Case title="ArticleSkeleton — title + 3 rows">
        <ArticleSkeleton rows={3} />
      </Case>
      <Case title="ArticleSkeleton — avatar + 2 rows, title width 120">
        <ArticleSkeleton avatar rows={2} title={120} />
      </Case>
      <Case title="ArticleSkeleton — rows only (title={false})">
        <ArticleSkeleton rows={4} title={false} />
      </Case>
      <Case title="DailyBrief / BriefCardSkeleton">
        <BriefCardSkeleton />
      </Case>
      <Case title="AgentTasks / TaskItemSkeleton">
        <TaskItemSkeleton />
      </Case>
      <Case title="memory / Loading">
        <MemoryLoading />
      </Case>
      <Case title="memory / DetailLoading">
        <MemoryDetailLoading />
      </Case>
      <Case title="Conversation / List skeleton">
        <ConversationListSkeleton />
      </Case>
    </div>
  </ThemeProvider>,
);
