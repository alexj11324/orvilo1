import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { HOTKEYS_REGISTRATION } from '@/const/hotkeys';
import hotkeyMeta from '@/locales/default/hotkey';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/slices/settings/selectors';
import { type HotkeyGroupId } from '@/types/hotkey';

const styles = createStaticStyles(({ css, cssVar }) => ({
  desc: css`
    font-size: 12px;
    line-height: 1.3;
    color: ${cssVar.colorTextDescription};
  `,
  hotkey: css`
    gap: 4px;

    kbd {
      min-width: 26px;
      height: 26px;
      border: 1px solid ${cssVar.colorBorder};
    }
  `,
}));

interface HotkeyContentProps {
  groupId: HotkeyGroupId;
}

const HotkeyContent = memo<HotkeyContentProps>(({ groupId }) => {
  const settings = useUserStore(settingsSelectors.currentSettings, isEqual);
  const { t } = useTranslation('hotkey');
  return (
    <>
      {HOTKEYS_REGISTRATION.filter((item) => item.group === groupId).map((item) => (
        <div className="flex items-start gap-4 w-full" key={item.id}>
          <div className="flex flex-col flex-1 gap-1 justify-between">
            <span>{t(`${item.id}.title`)}</span>
            {hotkeyMeta[`${item.id}.desc`] ? (
              <span className={styles.desc}>{t(`${item.id}.desc`)}</span>
            ) : null}
          </div>
          <KbdGroup className={styles.hotkey} style={{ zoom: 1.1 }}>
            {settings.hotkey[item.id].split('+').map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </KbdGroup>
        </div>
      ))}
    </>
  );
});

export default HotkeyContent;
