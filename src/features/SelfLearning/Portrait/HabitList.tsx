'use client';

import { Block, Flexbox, Icon, SearchBar, Tooltip } from '@lobehub/ui';
import type { DropdownItem } from '@lobehub/ui/base-ui';
import { ActionIcon, DropdownMenu, Popover, Tag, Text, toast } from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { ArchiveIcon, MessageSquareTextIcon, MoreHorizontalIcon, PencilIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import urlJoin from 'url-join';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import type { ExpertiseHabit } from '@/services/expertise';
import { expertiseService } from '@/services/expertise';

import { describeRecent } from '../helpers';
import LessonPreview from './LessonPreview';
import { portraitStyles as styles } from './styles';
import TeachBox from './TeachBox';

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
    <Tooltip title={tip}>
      <Flexbox horizontal gap={3} style={{ flex: 'none' }}>
        {recent.length === 0
          ? [0, 1, 2].map((i) => <span className={`${styles.dot} ${styles.dotNone}`} key={i} />)
          : recent.map((r, i) => (
              <span className={`${styles.dot} ${r.pass ? styles.dotOk : styles.dotBad}`} key={i} />
            ))}
      </Flexbox>
    </Tooltip>
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
      icon: <Icon icon={PencilIcon} />,
      key: 'correct',
      label: t('habit.action.correct'),
      onClick: () => setTeaching(true),
    },
    {
      icon: <Icon icon={MessageSquareTextIcon} />,
      key: 'source',
      label: t('habit.action.source'),
      onClick: () => navigate(lessonPath),
    },
    { type: 'divider' },
    {
      danger: true,
      icon: <Icon icon={ArchiveIcon} />,
      key: 'forget',
      label: t('habit.action.forget'),
      onClick: retire,
    },
  ];

  return (
    <Flexbox className={styles.row} gap={6}>
      <Flexbox horizontal align={'flex-start'} gap={12}>
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
          <Flexbox
            className={styles.previewTarget}
            gap={2}
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
            <Flexbox horizontal align={'center'} gap={8} wrap={'wrap'}>
              <Text fontSize={13.5} weight={500}>
                {habit.title}
              </Text>
              {habit.taughtByUser && (
                <Tag>
                  {t('habit.taughtTag')} · {dayjs(habit.createdAt).fromNow()}
                </Tag>
              )}
              {domainTitle && <Tag>{domainTitle}</Tag>}
            </Flexbox>
            <Text fontSize={12} type={'secondary'}>
              {hint}
            </Text>
          </Flexbox>
        </Popover>
        <RecentDots recent={habit.recent} />
        <Flexbox horizontal align={'center'} className={'teach'} gap={4} style={{ flex: 'none' }}>
          <DropdownMenu items={menu}>
            <ActionIcon icon={MoreHorizontalIcon} size={'small'} />
          </DropdownMenu>
        </Flexbox>
      </Flexbox>
      {teaching && (
        <Flexbox style={{ paddingInlineStart: 48 }}>
          <TeachBox autoFocus placeholder={t('habit.teach.placeholderCorrect')} onSubmit={revise} />
        </Flexbox>
      )}
    </Flexbox>
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
      <Flexbox gap={10}>
        <Flexbox horizontal align={'center'} gap={8} justify={'space-between'} wrap={'wrap'}>
          <Flexbox horizontal align={'baseline'} gap={8}>
            <Text weight={600}>{t('habits.title')}</Text>
            <Text fontSize={12} type={'secondary'}>
              {t('habits.summary', { count: habits.length })}
            </Text>
          </Flexbox>
          <Flexbox horizontal align={'center'} gap={8}>
            {viewAllPath && (
              <Link className={styles.viewAll} to={viewAllPath}>
                {t('habits.viewAll', { count: habits.length })}
              </Link>
            )}
            <SearchBar
              placeholder={t('habits.search')}
              style={{ width: 200 }}
              value={search}
              variant={'filled'}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Flexbox>
        </Flexbox>
        <Block padding={0} variant={'outlined'}>
          {filtered.map((h) => (
            <HabitRow
              agentId={agentId}
              domainTitle={domainTitles?.[h.domainId]}
              habit={h}
              key={h.id}
              onChanged={onChanged}
            />
          ))}
        </Block>
      </Flexbox>
    );
  },
);

HabitList.displayName = 'ExpertiseHabitList';

export default HabitList;
