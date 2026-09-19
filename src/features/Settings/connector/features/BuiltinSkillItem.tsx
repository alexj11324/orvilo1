'use client';

import { Avatar } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import NavItem from '@/features/NavPanel/components/NavItem';
import { useToolStore } from '@/store/tool';
import { builtinToolSelectors } from '@/store/tool/selectors';

interface BuiltinSkillItemProps {
  avatar?: string;
  identifier: string;
  isSelected?: boolean;
  onSelect: () => void;
  title: string;
}

/**
 * A row for a builtin tool in the Connector settings list.
 *
 * Install/uninstall state is fetched on mount so an uninstalled tool reads as
 * muted; the install affordance itself lives in the detail panel and in the
 * chat-input tool menu.
 */
const BuiltinSkillItem = memo<BuiltinSkillItemProps>(
  ({ identifier, title, avatar, isSelected, onSelect }) => {
    const isInstalled = useToolStore(builtinToolSelectors.isBuiltinToolInstalled(identifier));

    return (
      <NavItem
        active={isSelected}
        icon={() => <Avatar avatar={avatar} size={18} />}
        title={title}
        titleColor={!isInstalled ? cssVar.colorTextDescription : undefined}
        onClick={onSelect}
      />
    );
  },
);

BuiltinSkillItem.displayName = 'BuiltinSkillItem';

export default BuiltinSkillItem;
