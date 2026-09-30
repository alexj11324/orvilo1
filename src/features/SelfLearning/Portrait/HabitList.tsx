'use client';

import type { DropdownItem } from '@lobehub/ui/base-ui';
import { ActionIcon, DropdownMenu, Popover, Tag, Text, toast } from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ArchiveIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import urlJoin from 'url-join';

import { Input } from '@/components/ui/input';
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
        <Text code fontSize={12} style={{ flex: 'none', marginTop: 2 }} type={'secondary'}>
          {habit.code}
        </Text>
        <Popover
          // Long enough that dragging the pointer down the list does not fetch every row.
          openDelay={420}
          // Below the row by preference, so the row the reader is pointing at stays visible
          // while they move into the card.
          placement={'bottomRight'}
          // Preference, not a rule: reading down a list parks the pointer on the last visible
          // row, and pinning the card downward there pushes its body off-screen. Base UI's
          // default side avoidance flips it back above when the space below runs out.
          positionerProps={{ collisionPadding: 12 }}
          trigger={'hover'}
          content={
            <LessonPreview
              code={habit.code}
              layer={habit.layer}
              lessonId={habit.id}
              lessonPath={lessonPath}
              title={habit.title}
            />
          }
        >
          <div
            className={cx(styles.previewTarget, 'flex flex-col gap-0.5')}
            style={{ flex: 1, minWidth: 0 }}
            onClick={() => navigate(lessonPath)}
            // base-ui gives the trigger role="button" and focus, but brings no activation of
            // its own, so a keyboard user could tab here and have Enter do nothing.
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              navigate(lessonPath);
            }}
          >
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <Text fontSize={13.5} weight={500}>
                {habit.title}
              </Text>
              {habit.taughtByUser && (
                <Tag>
                  {t('habit.taughtTag')} · {dayjs(habit.createdAt).fromNow()}
                </Tag>
              )}
              {domainTitle && <Tag>{domainTitle}</Tag>}
            </div>
            <Text fontSize={12} type={'secondary'}>
              {hint}
            </Text>
          </div>
        </Popover>
        <RecentDots recent={habit.recent} />
        <div className={cx('teach', 'flex items-center gap-1')} style={{ flex: 'none' }}>
          <DropdownMenu items={menu}>
            <ActionIcon icon={MoreHorizontalIcon} size={'small'} />
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
            <Text weight={600}>{t('habits.title')}</Text>
            <Text fontSize={12} type={'secondary'}>
              {t('habits.summary', { count: habits.length })}
            </Text>
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
