import type { TaskActivityIssueRef } from '@orvilo/types';
import type { ReactElement, ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { usePermission } from '@/hooks/usePermission';

import {
  type DescribedPropertyChange,
  type PropertyActivitySlot,
  resolvePropertyActivityCopy,
} from './propertyActivityCopy';
import { openTaskDescriptionHistoryModal } from './TaskDescriptionHistoryModal';

const IssueRef = ({ issue }: { issue: TaskActivityIssueRef }) => {
  const { t } = useTranslation('chat');
  if ('unavailable' in issue) return <span>{t('taskDetail.activities.unavailable.issue')}</span>;
  return (
    <WorkspaceLink
      className="text-foreground hover:underline"
      to={taskDetailPath(issue.identifier, undefined, issue.name ?? undefined)}
    >
      {issue.name ? `${issue.identifier} ${issue.name}` : issue.identifier}
    </WorkspaceLink>
  );
};

const Slot = ({ slot }: { slot: PropertyActivitySlot }) => {
  const { t } = useTranslation('chat');
  switch (slot.kind) {
    case 'text': {
      return <span>{slot.text}</span>;
    }
    case 'label': {
      return <span>{t(slot.key)}</span>;
    }
    case 'issue': {
      return <IssueRef issue={slot.ref} />;
    }
    case 'link': {
      const name = slot.title || slot.url || t('taskDetail.activities.unavailable.link');
      if (!slot.url) return <span>{name}</span>;
      return (
        <a
          className="text-foreground hover:underline"
          href={slot.url}
          rel="noreferrer"
          target="_blank"
        >
          {name}
        </a>
      );
    }
  }
};

interface PropertyChangeSentenceProps {
  /** The actor node the caller already built — the same one every feed sentence uses. */
  actor: ReactElement;
  change: DescribedPropertyChange;
  /** Detail refresh, for a restore made from the description history. */
  onChanged: () => Promise<void>;
  taskIdentifier?: string;
  taskUuid?: string;
}

/**
 * The sentence of one property row whose wording comes from
 * `resolvePropertyActivityCopy`. A description edit also offers the way to see
 * what changed: the description history the row is a pointer into.
 */
const PropertyChangeSentence = ({
  actor,
  change,
  onChanged,
  taskIdentifier,
  taskUuid,
}: PropertyChangeSentenceProps): ReactNode => {
  const { t } = useTranslation('chat');
  const { allowed: canEdit } = usePermission('create_content');
  const copy = resolvePropertyActivityCopy(change);
  if (!copy) return null;

  const components: Record<string, ReactElement> = { actor };
  for (const [name, slot] of Object.entries(copy.slots)) {
    components[name] = <Slot slot={slot} />;
  }

  return (
    <>
      <Trans components={components} i18nKey={copy.key} ns={'chat'} />
      {change.field === 'description' && taskUuid && (
        // `xs` keeps the action inside the feed line's height.
        <Button
          size="xs"
          variant="link"
          onClick={() =>
            openTaskDescriptionHistoryModal({
              canEdit,
              identifier: taskIdentifier ?? taskUuid,
              onChanged,
              taskId: taskUuid,
            })
          }
        >
          {t('taskDetail.activities.description.viewHistory')}
        </Button>
      )}
    </>
  );
};

export default PropertyChangeSentence;
