'use client';
import { HotkeyInput } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form, { type FormGroupItemType } from '@/components/GroupForm';
import SettingsSectionSkeleton from '@/components/Skeleton/Settings/Section';
import { toast } from '@/components/toast';
import { Spinner } from '@/components/ui/spinner';
import { DESKTOP_HOTKEYS_REGISTRATION } from '@/const/desktopGlobalShortcuts';
import { HOTKEYS_REGISTRATION } from '@/const/hotkeys';
import { FORM_STYLE } from '@/const/layoutTokens';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { useElectronStore } from '@/store/electron';
import { desktopHotkeysSelectors } from '@/store/electron/selectors';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';
import { type DesktopHotkeyItem } from '@/types/hotkey';

import { desktopHotkeyDisplay } from './desktopHotkeyDisplay';
import { hotkeyFormStyles } from './styles';
import { getDesktopHotkeyConflicts } from './visibleHotkeys';

const HotkeySetting = memo(() => {
  const { t } = useTranslation(['setting', 'hotkey']);
  const [form] = Form.useForm();

  const hotkeys = useElectronStore(desktopHotkeysSelectors.hotkeys, isEqual);
  const { hotkey: appHotkeys } = useUserStore(settingsSelectors.currentSettings, isEqual);

  const [isHotkeysInit, updateDesktopHotkey, useFetchDesktopHotkeys] = useElectronStore((s) => [
    desktopHotkeysSelectors.isHotkeysInit(s),
    s.updateDesktopHotkey,
    s.useFetchDesktopHotkeys,
  ]);

  useFetchDesktopHotkeys();

  const [loading, setLoading] = useState(false);

  if (!isHotkeysInit) return <SettingsSectionSkeleton />;

  const conflictsOf = (id: DesktopHotkeyItem['id']) =>
    getDesktopHotkeyConflicts(hotkeys, id, appHotkeys, HOTKEYS_REGISTRATION);

  const updateHotkey = async (id: DesktopHotkeyItem['id'], value: string) => {
    // The main process only knows other global shortcuts, not the in-app ones.
    if (value && conflictsOf(id).includes(value)) {
      toast.error(t('hotkey.errors.CONFLICT', { ns: 'setting' }));
      return;
    }
    setLoading(true);
    try {
      const result = await updateDesktopHotkey(id, value);
      if (result.success) {
        toast.success(t('hotkey.updateSuccess', { ns: 'setting' }));
      } else {
        // Show the appropriate error message based on error type
        toast.error(t(`hotkey.errors.${result.errorType}` as any, { ns: 'setting' }));
      }
    } catch {
      toast.error(t('hotkey.updateError', { ns: 'setting' }));
    } finally {
      setLoading(false);
    }
  };

  const mapHotkeyItem = (item: DesktopHotkeyItem) => ({
    children: (
      <HotkeyInput
        allowClear={!item.nonEditable}
        disabled={item.nonEditable}
        hotkeyConflicts={conflictsOf(item.id)}
        placeholder={t('hotkey.record')}
        resetValue={item.keys}
        texts={{ clear: t('hotkey.clearBinding') }}
        value={desktopHotkeyDisplay(hotkeys[item.id] ?? '')}
        onChange={(value) => void updateHotkey(item.id, value)}
      />
    ),

    // Named Form items inject their own value, so normalize that binding too.
    getValueProps: (value: string) => ({ value: desktopHotkeyDisplay(value ?? '') }),

    label: t(`desktop.${item.id}.title`, { ns: 'hotkey' }),
    name: item.id,
  });

  const desktop: FormGroupItemType = {
    children: DESKTOP_HOTKEYS_REGISTRATION.map((item) => mapHotkeyItem(item)),
    extra: loading && <Spinner className="opacity-50" />,
    title: (
      <SettingsSearchAnchor id={'hotkey-desktop'}>{t('hotkey.group.desktop')}</SettingsSearchAnchor>
    ),
  };

  return (
    <Form
      classNames={{ item: hotkeyFormStyles.item }}
      collapsible={false}
      form={form}
      initialValues={hotkeys}
      items={[desktop]}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
    />
  );
});

export default HotkeySetting;
