import { ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useTaskStore } from '@/store/task';

const AutomationBreadcrumb = memo<{ taskId: string }>(({ taskId }) => {
  const { t } = useTranslation('automation');
  const name = useTaskStore((s) => s.taskDetailMap[taskId]?.name);
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<WorkspaceLink to={'/automations'} />}>
            <div className="font-medium" style={{ color: 'inherit' }}>
              {t('page.title')}
            </div>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <ChevronRight />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <div className="truncate min-w-0 font-medium" style={{ color: 'inherit', maxWidth: 240 }}>
            {name || taskId}
          </div>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
});

export default AutomationBreadcrumb;
