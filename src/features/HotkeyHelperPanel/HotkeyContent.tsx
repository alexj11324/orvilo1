import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { HOTKEYS_REGISTRATION } from '@/const/hotkeys';
import hotkeyMeta from '@/locales/default/hotkey';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/slices/settings/selectors';
import { type HotkeyGroupId } from '@/types/hotkey';

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
            <span className="text-sm leading-5.5">{t(`${item.id}.title`)}</span>
            {hotkeyMeta[`${item.id}.desc`] ? (
              <span className="text-xs leading-5 text-foreground-description">
                {t(`${item.id}.desc`)}
              </span>
            ) : null}
          </div>
          <KbdGroup>
            {settings.hotkey[item.id].split('+').map((k) => (
              <Kbd
                className="rounded-(--radius-chip) border border-border text-xs leading-5"
                key={k}
              >
                {k}
              </Kbd>
            ))}
          </KbdGroup>
        </div>
      ))}
    </>
  );
});

export default HotkeyContent;
