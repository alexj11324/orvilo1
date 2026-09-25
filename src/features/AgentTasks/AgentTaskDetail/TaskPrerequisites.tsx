import { Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Button, Input, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { CircleDashed, PlusIcon, XIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskStatusIcon from '../features/TaskStatusIcon';
import { taskDetailPath } from '../shared/taskDetailPath';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';

const TASK_STATUS_SET = new Set<string>([
  'backlog',
  'canceled',
  'completed',
  'failed',
  'paused',
  'running',
  'scheduled',
]);

const toTaskStatus = (status?: string | null): TaskStatus =>
  status && TASK_STATUS_SET.has(status) ? (status as TaskStatus) : 'backlog';

interface RelationRow {
  /** Which side of this task the edge lives on: `out` = this task declared
   * the edge, `in` = the other task declared it on us (a "blocking" edge). */
  direction: 'in' | 'out';
  /** Identifier rendered as the row's target, e.g. `T-1`. */
  identifier: string;
  name?: string | null;
  /** Identifier the remove call is keyed on — `TaskModel.resolve` treats
   * non-`task_` strings as identifiers, so the identifier resolves under any
   * raw id convention (seeded `taskpvNNNN` ids, real `task_` ids alike). */
  removeTarget: string;
  status?: string | null;
}

const errorKey = (err: unknown) => {
  const message = err instanceof Error ? err.message : '';
  return message.includes('cycle')
    ? 'cycle'
    : message.includes('itself')
      ? 'self'
      : message.includes('project boundaries')
        ? 'project'
        : message.includes('Pause or reopen')
          ? 'active'
          : /not found|unavailable/i.test(message)
            ? 'unavailable'
            : 'error';
};

const RelationRowItem = ({
  allowed,
  onRemove,
  pending,
  row,
}: {
  allowed: boolean;
  onRemove: (row: RelationRow) => void;
  pending: boolean;
  row: RelationRow;
}) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const unavailable = !row.status;
  return (
    <Flexbox horizontal align={'center'} gap={2}>
      <Button
        disabled={unavailable}
        size={'small'}
        style={{ flex: 1, justifyContent: 'flex-start', minWidth: 0 }}
        title={row.name ?? row.identifier}
        type={'text'}
        icon={
          unavailable ? (
            <Icon icon={CircleDashed} size={16} style={{ color: 'inherit' }} />
          ) : (
            <TaskStatusIcon size={16} status={toTaskStatus(row.status)} />
          )
        }
        onClick={() => navigate(taskDetailPath(row.identifier, undefined, row.name))}
      >
        <Text ellipsis style={{ minWidth: 0 }}>
          <Text as={'span'} type={'secondary'}>
            {row.identifier}
          </Text>
          {row.name ? ` · ${row.name}` : ''}
          {unavailable ? ` · ${t('taskDetail.prerequisites.unavailable')}` : ''}
        </Text>
      </Button>
      {allowed && (
        <Button
          aria-label={t('taskDetail.prerequisites.remove', { identifier: row.identifier })}
          disabled={pending}
          icon={XIcon}
          size={'small'}
          type={'text'}
          onClick={() => onRemove(row)}
        />
      )}
    </Flexbox>
  );
};

/**
 * One rail relation group — Linear splits relations into "Blocked by",
 * "Blocking" and "Related" sections, each a heading with a "+" that reveals
 * the identifier form (Linear's hover-plus). The heading row shares the
 * section label's container-query visibility, so in the collapsed layout the
 * rows render as pills without the heading chrome.
 */
const RelationSection = memo(
  ({
    allowed,
    error,
    hint,
    onAdd,
    onRemove,
    rows,
    title,
  }: {
    allowed: boolean;
    error?: string;
    hint?: string;
    onAdd: (identifier: string) => Promise<boolean>;
    onRemove: (row: RelationRow) => void;
    rows: RelationRow[];
    title: string;
  }) => {
    const { t } = useTranslation('chat');
    const [adding, setAdding] = useState(false);
    const [identifier, setIdentifier] = useState('');
    const [pending, setPending] = useState(false);

    const submit = () => {
      const value = identifier.trim();
      if (!value || pending) return;
      setPending(true);
      void onAdd(value).then((added) => {
        setPending(false);
        if (added) {
          setIdentifier('');
          setAdding(false);
        }
      });
    };

    return (
      <Flexbox className={styles.railSection}>
        <div className={styles.railSectionHeader}>
          <span aria-level={3} className={styles.railSectionLabel} role={'heading'}>
            {title}
          </span>
          {allowed && (
            <ActionIcon
              aria-label={t('taskDetail.relations.addTo', { title })}
              icon={PlusIcon}
              size={'small'}
              title={t('taskDetail.relations.add')}
              onClick={() => setAdding((v) => !v)}
            />
          )}
        </div>
        {hint && (
          <Text fontSize={12} role={'status'} style={{ paddingInline: 8 }} type={'secondary'}>
            {hint}
          </Text>
        )}
        {rows.map((row) => (
          <RelationRowItem
            allowed={allowed}
            key={`${row.direction}-${row.identifier}`}
            pending={pending}
            row={row}
            onRemove={onRemove}
          />
        ))}
        {adding && (
          <form
            style={{ paddingInline: 8 }}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Flexbox horizontal gap={4}>
              <Input
                aria-label={t('taskDetail.prerequisites.input')}
                disabled={pending}
                placeholder={t('taskDetail.prerequisites.placeholder')}
                size={'small'}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
              <Button
                disabled={!identifier.trim() || pending}
                htmlType={'submit'}
                loading={pending}
                size={'small'}
              >
                {t('taskDetail.prerequisites.add')}
              </Button>
            </Flexbox>
          </form>
        )}
        {error && (
          <Text fontSize={12} role={'alert'} style={{ paddingInline: 8 }} type={'danger'}>
            {error}
          </Text>
        )}
      </Flexbox>
    );
  },
);

const TaskPrerequisiteEditor = ({ taskId }: { taskId: string }) => {
  const { t } = useTranslation('chat');
  const { allowed, reason } = usePermission('create_content');
  const detail = useTaskStore(taskDetailSelectors.activeTaskDetail);
  const addDependency = useTaskStore((s) => s.addDependency);
  const removeDependency = useTaskStore((s) => s.removeDependency);
  const addBlocking = useTaskStore((s) => s.addBlocking);
  const removeBlocking = useTaskStore((s) => s.removeBlocking);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dependencies = useMemo(() => detail?.dependencies ?? [], [detail?.dependencies]);
  const dependents = useMemo(() => detail?.dependents ?? [], [detail?.dependents]);

  const blockedBy = useMemo<RelationRow[]>(
    () =>
      dependencies
        .filter((dep) => dep.type === 'blocks')
        .map((dep) => ({
          direction: 'out' as const,
          identifier: dep.dependsOn,
          name: dep.name,
          removeTarget: dep.dependsOn,
          status: dep.status,
        })),
    [dependencies],
  );
  const blocking = useMemo<RelationRow[]>(
    () =>
      dependents
        .filter((dep) => dep.type === 'blocks')
        .map((dep) => ({
          direction: 'in' as const,
          identifier: dep.dependsBy,
          name: dep.name,
          removeTarget: dep.dependsBy,
          status: dep.status,
        })),
    [dependents],
  );
  // `relates` is symmetric in the reference, so edges pointing in both
  // directions render in the same Related group.
  const related = useMemo<RelationRow[]>(
    () => [
      ...dependencies
        .filter((dep) => dep.type !== 'blocks')
        .map((dep) => ({
          direction: 'out' as const,
          identifier: dep.dependsOn,
          name: dep.name,
          removeTarget: dep.dependsOn,
          status: dep.status,
        })),
      ...dependents
        .filter((dep) => dep.type !== 'blocks')
        .map((dep) => ({
          direction: 'in' as const,
          identifier: dep.dependsBy,
          name: dep.name,
          removeTarget: dep.dependsBy,
          status: dep.status,
        })),
    ],
    [dependencies, dependents],
  );

  const blocked = blockedBy.some((dep) => dep.status !== 'completed');

  const run = async (group: string, operation: () => Promise<void>) => {
    if (!allowed || pending) return false;
    setPending(true);
    setErrors((prev) => ({ ...prev, [group]: '' }));
    try {
      await operation();
      return true;
    } catch (err) {
      setErrors((prev) => ({ ...prev, [group]: t(`taskDetail.prerequisites.${errorKey(err)}`) }));
      return false;
    } finally {
      setPending(false);
    }
  };

  const removeBlockedBy = (row: RelationRow) =>
    void run('blockedBy', () => removeDependency(taskId, row.removeTarget));
  const removeBlockingRow = (row: RelationRow) =>
    void run('blocking', () => removeBlocking(taskId, row.removeTarget));
  const removeRelated = (row: RelationRow) =>
    void run('related', () =>
      row.direction === 'out'
        ? removeDependency(taskId, row.removeTarget)
        : removeBlocking(taskId, row.removeTarget),
    );

  return (
    <>
      <RelationSection
        allowed={allowed}
        error={errors.blockedBy}
        rows={blockedBy}
        title={t('taskDetail.blockedBy.title')}
        hint={
          t(
            blocked
              ? 'taskDetail.prerequisites.blocked'
              : blockedBy.length
                ? 'taskDetail.prerequisites.ready'
                : 'taskDetail.prerequisites.empty',
          ) as string
        }
        onAdd={(identifier) => run('blockedBy', () => addDependency(taskId, identifier, 'blocks'))}
        onRemove={removeBlockedBy}
      />
      {(blocking.length > 0 || allowed) && (
        <RelationSection
          allowed={allowed}
          error={errors.blocking}
          rows={blocking}
          title={t('taskDetail.blocking.title')}
          onAdd={(identifier) => run('blocking', () => addBlocking(taskId, identifier))}
          onRemove={removeBlockingRow}
        />
      )}
      {(related.length > 0 || allowed) && (
        <RelationSection
          allowed={allowed}
          error={errors.related}
          rows={related}
          title={t('taskDetail.related')}
          onAdd={(identifier) => run('related', () => addDependency(taskId, identifier, 'relates'))}
          onRemove={removeRelated}
        />
      )}
      {!allowed && reason && (
        <Text fontSize={12} style={{ paddingInline: 8 }} type={'secondary'}>
          {reason}
        </Text>
      )}
    </>
  );
};

const TaskPrerequisites = () => {
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  // Remount local input/error/pending state when navigating between issues.
  return taskId ? <TaskPrerequisiteEditor key={taskId} taskId={taskId} /> : null;
};

export default TaskPrerequisites;
