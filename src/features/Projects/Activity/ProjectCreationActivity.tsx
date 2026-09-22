import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { BoxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ProjectDetail } from '@/store/project';

const styles = createStaticStyles(({ css }) => ({
  event: css`
    font-size: 12px;
    line-height: 20px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

/** Creation is an immutable audit fact, not the project's current owner or current viewer. */
export function ProjectCreationActivity({ project }: { project: ProjectDetail['project'] }) {
  const { t } = useTranslation('project');
  const date = dayjs(project.createdAt);
  if (!project.createdAt || !date.isValid()) return null;
  const creator = project.createdBySnapshot?.displayName;
  return (
    <Flexbox horizontal align="flex-start" gap={8}>
      <Icon icon={BoxIcon} size={14} style={{ marginTop: 3 }} />
      <Text className={styles.event}>
        {creator ? t('activity.createdBy', { name: creator }) : t('activity.created')}
        {' · '}
        <time dateTime={date.toISOString()} title={date.format('YYYY-MM-DD HH:mm')}>
          {date.format('MMM D')}
        </time>
      </Text>
    </Flexbox>
  );
}
