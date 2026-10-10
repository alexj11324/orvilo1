import { type OrviloSkillProviderType } from '@orvilo/const';
import { createElement, memo } from 'react';

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

    return (
      <span className="anticon" role="img">
        {createElement(icon, { size, width: size, height: size, fill: 'var(--foreground)' })}
      </span>
    );
  },
);

OrviloSkillIcon.displayName = 'OrviloSkillIcon';

export default OrviloSkillIcon;
