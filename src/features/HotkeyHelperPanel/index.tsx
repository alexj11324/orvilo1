'use client';

import { Tabs } from '@lobehub/ui/base-ui';
import { HotkeyGroupEnum } from '@orvilo/const/hotkeys';
import { MessageSquare, Settings2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { useGlobalStore } from '@/store/global';
import { type HotkeyGroupId } from '@/types/hotkey';

import HotkeyContent from './HotkeyContent';

const HotkeyHelperPanel = memo(() => {
  const [open, updateSystemStatus] = useGlobalStore((s) => [
    s.status.showHotkeyHelper,
    s.updateSystemStatus,
  ]);
  const [active, setActive] = useState<HotkeyGroupId>(HotkeyGroupEnum.Essential);
  const { t } = useTranslation('setting');

  const handleClose = () => updateSystemStatus({ showHotkeyHelper: false });

  return (
    <ImperativeModal
      centered
      footer={null}
      open={open}
      styles={{
        body: { paddingBlock: 24 },
        mask: {
          backdropFilter: 'blur(8px)',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        },
      }}
      title={
        <Tabs
          activeKey={active}
          items={[
            {
              icon: <Settings2 />,
              key: HotkeyGroupEnum.Essential,
              label: t('hotkey.group.essential'),
            },
            {
              icon: <MessageSquare />,
              key: HotkeyGroupEnum.Conversation,
              label: t('hotkey.group.conversation'),
            },
          ]}
          onChange={(key) => setActive(key as HotkeyGroupId)}
        />
      }
      onCancel={handleClose}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]" style={{ gap: 32 }}>
        <HotkeyContent groupId={active} />
      </div>
    </ImperativeModal>
  );
});

export default HotkeyHelperPanel;
