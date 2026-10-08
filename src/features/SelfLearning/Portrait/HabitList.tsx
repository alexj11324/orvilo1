'use client';

import { cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ArchiveIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import urlJoin from 'url-join';

import ActionIcon from '@/components/ActionIcon';
import type { DropdownItem } from '@/components/ItemsMenu';
import { DropdownMenu } from '@/components/ItemsMenu';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import type { ExpertiseHabit } from '@/services/expertise';
import { expertiseService } from '@/services/expertise';

import { describeRecent } from '../helpers';
import LessonPreview from './LessonPreview';
import { portraitStyles as styles } from './styles';
import TeachBox from './TeachBox';

// `.fromNow()` needs the plugin; extending here keeps the module self-sufficient. See the
// note in `LessonDetail`.
dayjs.extend(relativeTime);

interface HabitListProps {
  agentId: string;
  /** Present when the list mixes several domains, so each row can say which one it belongs to. */
  domainTitles?: Record<string, string>;
  habits: (ExpertiseHabit & { domainId: string })[];
  onChanged: () => void;
  /** Where the complete, unfolded list lives; renders a "view all" link in the header. */
  viewAllPath?: string;
}

const RecentDots = memo<{ recent: ExpertiseHabit['recent'] }>(({ recent }) => {
  const { t } = useTranslation('selfLearning');
  const tip =
    recent.length === 0
      ? t('habit.recentTip.none')
      : t('habit.recentTip.title', {
          count: recent.length,
          list: recent
            .map((r) => (r.pass ? t('habit.recentTip.pass') : t('habit.recentTip.violation')))
            .join(' '),
        });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <div className="flex gap-[3px]" style={{ flex: 'none' }}>
                {recent.length === 0
                  ? [0, 1, 2].map((i) => (
                      <span className={`${styles.dot} ${styles.dotNone}`} key={i} />
                    ))
                  : recent.map((r, i) => (
                      <span
                        className={`${styles.dot} ${r.pass ? styles.dotOk : styles.dotBad}`}
                        key={i}
                      />
                    ))}
              </div>
            </span>
          }
        />
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

RecentDots.displayName = 'ExpertiseRecentDots';

interface HabitRowProps {
  agentId: string;
  domainTitle?: string;
  habit: ExpertiseHabit & { domainId: string };
  onChanged: () => void;
}

const HabitRow = memo<HabitRowProps>(({ agentId, domainTitle, habit, onChanged }) => {
  const { t } = useTranslation('selfLearning');
  const navigate = useWorkspaceAwareNavigate();
  const [teaching, setTeaching] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );
  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const schedulePreviewOpen = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setPreviewOpen(true), 420);
  };
  const schedulePreviewClose = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setPreviewOpen(false), 150);
  };

  const hint = useMemo(
    () => describeRecent(habit.recent, habit.taughtByUser, t),
    [habit.recent, habit.taughtByUser, t],
  );

  const revise = async (text: string) => {
    try {
      await expertiseService.reviseLesson({ lessonId: habit.id, text });
      toast.success(t('habit.teach.done'));
      setTeaching(false);
      onChanged();
    } catch {
      toast.error(t('habit.teach.failed'));
    }
  };

  const retire = async () => {
    try {
      await expertiseService.retireLesson(habit.id);
      toast.success(t('habit.teach.forgot'));
      onChanged();
    } catch {
      toast.error(t('habit.teach.failed'));
    }
  };

  const lessonPath = urlJoin(
    '/agent',
    agentId,
    'self-evolving',
    habit.domainId,
    'experience',
    habit.id,
  );
  const menu: DropdownItem[] = [
    {
      icon: <PencilIcon />,
      key: 'correct',
      label: t('habit.action.correct'),
      onClick: () => setTeaching(true),
    },
    {
      icon: <MessageSquareTextIcon />,
      key: 'source',
      label: t('habit.action.source'),
      onClick: () => navigate(lessonPath),
    },
    { type: 'divider' },
    {
      danger: true,
      icon: <ArchiveIcon />,
      key: 'forget',
      label: t('habit.action.forget'),
      onClick: retire,
    },
  ];

  return (
    <div className={cx(styles.row, 'flex flex-col gap-1.5')}>
      <div className="flex items-start gap-3">
        <div
          className="font-mono rounded bg-muted px-1 text-[12px] text-muted-foreground"
          style={{ flex: 'none', marginTop: 2 }}
        >
          {habit.code}
        </div>
        <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
          <PopoverTrigger
            render={
              <div
                className={cx(styles.previewTarget, 'flex flex-col gap-0.5')}
                style={{ flex: 1, minWidth: 0 }}
                onClick={() => navigate(lessonPath)}
                onMouseEnter={schedulePreviewOpen}
                onMouseLeave={schedulePreviewClose}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  navigate(lessonPath);
                }}
              >
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <div className="font-medium" style={{ fontSize: 13.5 }}>
                    {habit.title}
                  </div>
                  {habit.taughtByUser && (
                    <Badge variant="secondary">
                      {t('habit.taughtTag')} · {dayjs(habit.createdAt).fromNow()}
                    </Badge>
                  )}
                  {domainTitle && <Badge variant="secondary">{domainTitle}</Badge>}
                </div>
                <div className="text-[12px] text-muted-foreground">{hint}</div>
              </div>
            }
          />
          <PopoverContent
            align="end"
            className="w-auto p-0"
            side="bottom"
            onMouseEnter={clearHoverTimer}
            onMouseLeave={schedulePreviewClose}
          >
            <LessonPreview
              code={habit.code}
              layer={habit.layer}
              lessonId={habit.id}
              lessonPath={lessonPath}
              title={habit.title}
            />
          </PopoverContent>
        </Popover>
        <RecentDots recent={habit.recent} />
        <div className={cx('teach', 'flex items-center gap-1')} style={{ flex: 'none' }}>
          <DropdownMenu items={menu}>
            <ActionIcon
              aria-label={t('more', { ns: 'common' })}
              icon={MoreHorizontalIcon}
              size="small"
            />
          </DropdownMenu>
        </div>
      </div>
      {teaching && (
        <div className="flex flex-col" style={{ paddingInlineStart: 48 }}>
          <TeachBox autoFocus placeholder={t('habit.teach.placeholderCorrect')} onSubmit={revise} />
        </div>
      )}
    </div>
  );
});

HabitRow.displayName = 'ExpertiseHabitRow';

/**
 * The rules an agent carries, as a flat list in the order the server ranks them (most-used
 * first). One row per rule: what it says, where it came from, how it has held up, and the
 * actions to correct, trace or retire it.
 *
 * It used to group rows by a reliability verdict — 老毛病 / 还不稳 / 刚学的 / 已养成 — which read
 * as a growth narrative and made a stored rule sound like a habit being formed. S60 drops that
 * framing: the outcome counts stay, the verdict word does not.
 */
const HabitList = memo<HabitListProps>(
  ({ agentId, domainTitles, habits, onChanged, viewAllPath }) => {
    const { t } = useTranslation('selfLearning');
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
      const q = search.trim().toLowerCase();
      if (!q) return habits;
      return habits.filter(
        (h) => h.title.toLowerCase().includes(q) || h.code.toLowerCase().includes(q),
      );
    }, [habits, search]);

    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 justify-between" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-baseline gap-2">
            <div className="font-semibold">{t('habits.title')}</div>
            <div className="text-[12px] text-muted-foreground">
              {t('habits.summary', { count: habits.length })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewAllPath && (
              <Link className={styles.viewAll} to={viewAllPath}>
                {t('habits.viewAll', { count: habits.length })}
              </Link>
            )}
            <div className="relative" style={{ width: 200 }}>
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={14}
              />
              <Input
                className="h-7 pl-7"
                placeholder={t('habits.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div
          className="flex flex-col p-0 border"
          style={{ borderColor: cssVar.colorBorderSecondary, background: cssVar.colorBgContainer }}
        >
          {filtered.map((h) => (
            <HabitRow
              agentId={agentId}
              domainTitle={domainTitles?.[h.domainId]}
              habit={h}
              key={h.id}
              onChanged={onChanged}
            />
          ))}
        </div>
      </div>
    );
  },
);

HabitList.displayName = 'ExpertiseHabitList';

export default HabitList;
