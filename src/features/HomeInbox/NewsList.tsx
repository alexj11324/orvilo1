import { cn } from 'cn';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { createElement, lazy, memo, Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import BriefCardArtifacts from '@/features/DailyBrief/BriefCardArtifacts';
import BriefIcon from '@/features/DailyBrief/BriefIcon';
import { type BriefItem } from '@/features/DailyBrief/types';
import { homeType } from '@/features/Home/components/homeType';
import Time from '@/features/Home/components/Time';
import { useBriefStore } from '@/store/brief';

const Markdown = lazy(() => import('@lobehub/ui/es/Markdown/index'));

const AVATAR_SIZE = 20;

/** Past this the rail card stops being a card and starts being a page. */
const RAIL_COLLAPSED_COUNT = 6;

const styles = {
  bareBody: 'pbe-2 ps-9.5 pe-2',
  bareList: '-mx-2',
  bareRow: 'py-1.75 px-2 rounded-(--radius-button)',
  body: 'pbe-3 ps-11 pe-3.5',
  list: 'overflow-hidden border border-divider rounded-(--radius-card) bg-card',
  row: 'justify-start w-full h-auto py-2.75 px-3.5 border-0 text-start text-sm leading-5.5 transition-[background] duration-(--orvilo-motion-fast) ease-[ease] [&:hover]:bg-accent',
  section: '[&:not(:last-child)]:border-be [&:not(:last-child)]:border-divider',
};

interface NewsItemProps {
  bare?: boolean;
  brief: BriefItem;
  showTime: boolean;
}

/**
 * One non-actionable brief, collapsed to a single line. The agent that surfaced
 * it leads the row; opening it reads it (there is nothing to decide) and drops
 * the finding's detail inline.
 */
const NewsItem = memo<NewsItemProps>(({ bare, brief, showTime }) => {
  const markBriefRead = useBriefStore((s) => s.markBriefRead);

  const [expanded, setExpanded] = useState(false);
  const [localRead, setLocalRead] = useState(false);
  // Derived, not snapshotted: the day digest keeps resolved briefs in the list,
  // and a bulk mark-all-read updates them through an SWR revalidation — a
  // useState seeded from the first render would never pick that up.
  const read = localRead || Boolean(brief.readAt) || Boolean(brief.resolvedAt);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      if (!prev && !read) {
        setLocalRead(true);
        void markBriefRead(brief.id);
      }
      return !prev;
    });
  }, [brief.id, markBriefRead, read]);

  return (
    <div className={cn(bare ? undefined : styles.section, 'flex flex-col')}>
      <Button
        className={cn(cn(styles.row, bare && styles.bareRow))}
        variant="ghost"
        onClick={toggle}
      >
        <div className="flex w-full items-center gap-2.5">
          {brief.agent ? (
            // Fade the whole row once read: the leading glyph dims with the title
            // so a scanned item recedes as one, not just a lighter headline.
            <span className="inline-flex flex-none" style={{ opacity: read ? 0.5 : 1 }}>
              <AssigneeAvatar agentId={brief.agent.id} size={AVATAR_SIZE} />
            </span>
          ) : (
            <BriefIcon muted={read} type={brief.type} />
          )}
          <div
            className={cn('truncate', 'block', 'flex-1 min-w-0', homeType.itemTitle)}
            style={{
              color: read ? 'var(--foreground-tertiary)' : undefined,
              fontWeight: read ? 400 : undefined,
            }}
          >
            {brief.title}
          </div>
          {showTime && <Time date={brief.createdAt} />}
          {createElement(expanded ? ChevronDownIcon : ChevronRightIcon, {
            className: 'text-foreground-quaternary',
            size: 14,
          })}
        </div>
      </Button>

      {expanded && (brief.summary || brief.artifacts) && (
        <div className={cn(bare ? styles.bareBody : styles.body, 'flex flex-col gap-2')}>
          {brief.summary && (
            <Suspense fallback={null}>
              <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
                {brief.summary}
              </Markdown>
            </Suspense>
          )}
          <BriefCardArtifacts artifacts={brief.artifacts} />
        </div>
      )}
    </div>
  );
});

interface NewsListProps {
  /** Rendered inside a rail card, which already draws the shell. */
  bare?: boolean;
  news: BriefItem[];
  /** Relative time is useful within today's feed, but redundant under a dated historical heading. */
  showTime: boolean;
}

/**
 * Non-actionable briefs: the agent found something worth knowing or completed a
 * recurring run, but there is nothing to decide. One line each — the detail
 * lives behind the click, so a week of findings still fits on screen.
 */
const NewsList = memo<NewsListProps>(({ bare, news, showTime }) => {
  const { t } = useTranslation('home');
  const [expanded, setExpanded] = useState(false);

  if (news.length === 0) return null;

  // In the rail a long feed would push every card below it off screen, so the
  // card stays a card and the tail is one click away.
  const collapsed = bare && !expanded && news.length > RAIL_COLLAPSED_COUNT;
  const shown = collapsed ? news.slice(0, RAIL_COLLAPSED_COUNT) : news;

  return (
    <div className={cn(bare ? styles.bareList : styles.list, 'flex flex-col')}>
      {shown.map((brief) => (
        <NewsItem bare={bare} brief={brief} key={brief.id} showTime={showTime} />
      ))}
      {collapsed && (
        <Button
          className={cn(cn(styles.row, styles.bareRow, homeType.supporting))}
          variant="ghost"
          onClick={() => setExpanded(true)}
        >
          {t('inbox.news.showAll', { count: news.length })}
        </Button>
      )}
    </div>
  );
});

export default NewsList;
