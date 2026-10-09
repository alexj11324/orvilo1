import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type KeyboardEvent, type MouseEvent } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { type ActionIconProps } from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useUserMemoryStore } from '@/store/userMemory';

interface PreferenceDropdownProps {
  id: string;
  size?: ActionIconProps['size'];
}

const PreferenceDropdown = memo<PreferenceDropdownProps>(({ id, size = 'small' }) => {
  const { t } = useTranslation(['memory', 'common']);

  const preferences = useUserMemoryStore((s) => s.preferences);
  const deletePreference = useUserMemoryStore((s) => s.deletePreference);
  const setEditingMemory = useUserMemoryStore((s) => s.setEditingMemory);

  const handleMenuClick = (info: { domEvent: MouseEvent | KeyboardEvent; key: string }) => {
    info.domEvent.stopPropagation();

    if (info.key === 'edit') {
      const preference = preferences.find((p) => p.id === id);
      if (preference) {
        setEditingMemory(id, preference.conclusionDirectives || '', 'preference');
      }
    } else if (info.key === 'delete') {
      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('preference.deleteConfirm'),
        okButtonProps: { danger: true },
        okText: t('confirm', { ns: 'common' }),
        onOk: async () => {
          await deletePreference(id);
        },
        title: t('preference.deleteTitle'),
      });
    }
  };

  const menuItems = [
    {
      icon: <Pencil size={14} />,
      key: 'edit',
      label: t('preference.actions.edit'),
      onClick: handleMenuClick,
    },
    {
      danger: true,
      icon: <Trash2 size={14} />,
      key: 'delete',
      label: t('preference.actions.delete'),
      onClick: handleMenuClick,
    },
  ];

  return (
    <SidebarDropdownMenu items={menuItems}>
      <ActionIcon aria-label={t('more', { ns: 'common' })} icon={MoreHorizontal} size={size} />
    </SidebarDropdownMenu>
  );
});

export default PreferenceDropdown;
