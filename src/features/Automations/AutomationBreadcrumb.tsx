import { Breadcrumb as AntBreadcrumb } from 'antd';
import { ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useTaskStore } from '@/store/task';

const AutomationBreadcrumb = memo<{ taskId: string }>(({ taskId }) => {
  const { t } = useTranslation('automation');
  const name = useTaskStore((s) => s.taskDetailMap[taskId]?.name);
  return (
    <AntBreadcrumb
      separator={<ChevronRight />}
      items={[
        {
          title: (
            <WorkspaceLink to={'/automations'}>
              <div className="font-medium" style={{ color: 'inherit' }}>
                {t('page.title')}
              </div>
            </WorkspaceLink>
          ),
        },
        {
          title: (
            <div
              className="truncate min-w-0 font-medium"
              style={{ color: 'inherit', maxWidth: 240 }}
            >
              {name || taskId}
            </div>
          ),
        },
      ]}
    />
  );
});

export default AutomationBreadcrumb;
