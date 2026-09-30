'use client';

import { Tag } from '@lobehub/ui/base-ui';
import { EyeIcon, PlayIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { PermissionResourceType } from '@/services/resourcePermission';

import { useResourcePermission } from './useResourcePermission';

export interface AccessLevelTagProps {
  resourceId?: string;
  resourceType: PermissionResourceType;
}

/**
 * At-a-glance "why is this read-only" badge for members below `edit` access:
 * shows the granted level (view / use) with a tooltip explaining what it means
 * and who to ask for more. Renders nothing for creators/owners, `edit` level,
 * personal mode, or while the level is still loading — surfaces with no
 * restriction stay visually unchanged.
 */
const AccessLevelTag = memo<AccessLevelTagProps>(({ resourceId, resourceType }) => {
  const { t } = useTranslation('setting');
  const hasActiveWorkspace = useHasActiveWorkspace();
  const { data } = useResourcePermission(resourceType, hasActiveWorkspace ? resourceId : undefined);

  if (!data || data.canManage || data.accessLevel === 'edit') return null;

  const viewOnly = data.accessLevel === 'view';

  return (
    <SimpleTooltip
      title={t(viewOnly ? 'permission.accessTag.viewOnlyTip' : 'permission.accessTag.useOnlyTip')}
    >
      <Tag
        icon={
          <span className="anticon" role="img">
            {createElement(viewOnly ? EyeIcon : PlayIcon, {
              size: '1em',
              width: '1em',
              height: '1em',
              fill: 'transparent',
            })}
          </span>
        }
      >
        {t(viewOnly ? 'permission.generalAccess.viewable' : 'permission.generalAccess.usable')}
      </Tag>
    </SimpleTooltip>
  );
});

AccessLevelTag.displayName = 'AccessLevelTag';

export default AccessLevelTag;
