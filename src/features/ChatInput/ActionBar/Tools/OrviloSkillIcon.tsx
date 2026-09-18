import { Icon } from '@lobehub/ui';
import { type OrviloSkillProviderType } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { memo } from 'react';

export const SKILL_ICON_SIZE = 20;

/**
 * Orvilo Skill Provider icon component
 */
const OrviloSkillIcon = memo<Pick<OrviloSkillProviderType, 'icon' | 'label'> & { size: number }>(
  ({ icon, label, size = SKILL_ICON_SIZE }) => {
    if (typeof icon === 'string') {
      return (
        <img
          alt={label}
          src={icon}
          style={{ maxHeight: size, maxWidth: size, objectFit: 'contain' }}
        />
      );
    }

    return <Icon fill={cssVar.colorText} icon={icon} size={size} />;
  },
);

OrviloSkillIcon.displayName = 'OrviloSkillIcon';

export default OrviloSkillIcon;
