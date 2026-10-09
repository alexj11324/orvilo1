import { ListTodoIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { ISSUE_RESOURCE_KINDS, useIssueDetailActions } from './useIssueDetailActions';

interface TaskDetailAddActionsProps {
  onAddSubIssue: () => void;
}

/**
 * The always-visible row of "add" actions under the description. Sections
 * below only render once they have content, so this row is where an empty
 * issue learns it can take sub-issues, links, pull requests and documents.
 * Viewers who cannot edit get no row at all.
 */
const TaskDetailAddActions = memo<TaskDetailAddActionsProps>(({ onAddSubIssue }) => {
  const { t } = useTranslation('chat');
  const { addResource, capabilities } = useIssueDetailActions();

  if (!capabilities.canAddSubIssue && !capabilities.canAddResource) return null;

  const resourceHint =
    capabilities.resourceBlockedReason === 'loading' ? t('taskDetail.add.loading') : undefined;

  return (
    <div aria-label={t('taskDetail.add.group')} className="flex flex-wrap gap-2" role="group">
      <Button size="sm" type="button" variant="secondary" onClick={onAddSubIssue}>
        <ListTodoIcon aria-hidden data-icon="inline-start" />
        {t('taskDetail.addSubtask')}
      </Button>
      {ISSUE_RESOURCE_KINDS.map(([kind, Icon]) => (
        // A disabled button swallows pointer events, so the reason lives on the wrapper.
        <span className="inline-flex" key={kind} title={resourceHint}>
          <Button
            disabled={!capabilities.canAddResource}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => addResource(kind)}
          >
            <Icon aria-hidden data-icon="inline-start" />
            {t(`taskDetail.add.${kind}`)}
          </Button>
        </span>
      ))}
    </div>
  );
});

export default TaskDetailAddActions;
