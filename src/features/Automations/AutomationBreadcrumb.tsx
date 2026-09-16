import { Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
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
      separator={<Icon icon={ChevronRight} />}
      items={[
        {
          title: (
            <WorkspaceLink to={'/automations'}>
              <Text color={'inherit'} weight={500}>
                {t('page.title')}
              </Text>
            </WorkspaceLink>
          ),
        },
        {
          title: (
            <Text ellipsis color={'inherit'} style={{ maxWidth: 240 }} weight={500}>
              {name || taskId}
            </Text>
          ),
        },
      ]}
    />
  );
});

export default AutomationBreadcrumb;
