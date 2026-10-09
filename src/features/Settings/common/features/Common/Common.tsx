'use client';

import { ImageSelect } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { Ban, Gauge, Monitor, Moon, Mouse, Sun, Waves, XIcon } from 'lucide-react';
import { useTheme as useNextThemesTheme } from 'next-themes';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import Form, { type FormGroupItemType } from '@/components/GroupForm';
import SettingsSectionSkeleton from '@/components/Skeleton/Settings/Section';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FORM_STYLE } from '@/const/layoutTokens';
import { imageUrl } from '@/const/url';
import { isDesktop } from '@/const/version';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { useSaveState } from '@/hooks/useSaveState';
import { localeOptions } from '@/locales/resources';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';
import { type LocaleMode } from '@/types/locale';
import { preloadLang } from '@/utils/client/preloadLang';

const Common = memo(() => {
  const { t } = useTranslation('setting');

  const general = useUserStore((s) => settingsSelectors.currentSettings(s).general, isEqual);
  const { theme, setTheme } = useNextThemesTheme();
  const language = useGlobalStore(systemStatusSelectors.language);
  const [setSettings, isUserStateInit] = useUserStore((s) => [s.setSettings, s.isUserStateInit]);
  const [switchLocale, isStatusInit] = useGlobalStore((s) => [s.switchLocale, s.isStatusInit]);
  const { status: saveStatus, lastSavedAt, save, retry } = useSaveState();

  // Use the theme value from next-themes, default to 'system'
  const currentTheme = theme || 'system';

  const handleLangChange = (value: LocaleMode) => {
    switchLocale(value);
  };

  if (!(isStatusInit && isUserStateInit)) return <SettingsSectionSkeleton />;

  const themeFormGroup: FormGroupItemType = {
    children: [
      {
        children: (
          <ImageSelect
            height={60}
            unoptimized={isDesktop}
            value={currentTheme}
            width={100}
            options={[
              {
                icon: Sun,
                img: imageUrl('theme_light.webp'),
                label: t('settingCommon.themeMode.light'),
                value: 'light',
              },
              {
                icon: Moon,
                img: imageUrl('theme_dark.webp'),
                label: t('settingCommon.themeMode.dark'),
                value: 'dark',
              },
              {
                icon: Monitor,
                img: imageUrl('theme_auto.webp'),
                label: t('settingCommon.themeMode.auto'),
                value: 'system',
              },
            ]}
            onChange={(value) => setTheme(value === 'auto' ? 'system' : value)}
          />
        ),
        label: (
          <SettingsSearchAnchor id={'appearance-theme-mode'}>
            {t('settingCommon.themeMode.title')}
          </SettingsSearchAnchor>
        ),
        minWidth: undefined,
      },
      {
        children: (
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', justifyContent: 'flex-end' }}
          >
            <div className="w-1/2">
              <Select
                defaultValue={language}
                items={[
                  { label: t('settingCommon.lang.autoMode'), value: 'auto' },
                  ...localeOptions,
                ]}
                onValueChange={(value) => {
                  if (value !== null) handleLangChange(value as LocaleMode);
                }}
              >
                <SelectTrigger aria-label={t('settingCommon.lang.title')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { label: t('settingCommon.lang.autoMode'), value: 'auto' },
                    ...localeOptions,
                  ].map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      onMouseEnter={() => preloadLang(option.value as LocaleMode)}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ),
        label: (
          <SettingsSearchAnchor id={'appearance-language'}>
            {t('settingCommon.lang.title')}
          </SettingsSearchAnchor>
        ),
      },
      {
        children: (
          <Tabs>
            <TabsList>
              {[
                {
                  icon: createElement(Ban, { size: 16 }),
                  key: 'disabled',
                  label: t('settingAppearance.animationMode.disabled'),
                },
                {
                  icon: createElement(Gauge, { size: 16 }),
                  key: 'agile',
                  label: t('settingAppearance.animationMode.agile'),
                },
                {
                  icon: createElement(Waves, { size: 16 }),
                  key: 'elegant',
                  label: t('settingAppearance.animationMode.elegant'),
                },
              ].map((item) => (
                <TabsTrigger key={item.key} value={item.key}>
                  {item.icon}
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ),
        label: (
          <SettingsSearchAnchor id={'appearance-animation'}>
            {t('settingAppearance.animationMode.title')}
          </SettingsSearchAnchor>
        ),
        minWidth: undefined,
        name: 'animationMode',
        trigger: 'onValueChange',
        valuePropName: 'value',
      },
      {
        children: (
          <Tabs>
            <TabsList>
              {[
                {
                  icon: createElement(Ban, { size: 16 }),
                  key: 'disabled',
                  label: t('settingAppearance.contextMenuMode.disabled'),
                },
                {
                  icon: createElement(Mouse, { size: 16 }),
                  key: 'default',
                  label: t('settingAppearance.contextMenuMode.default'),
                },
              ].map((item) => (
                <TabsTrigger key={item.key} value={item.key}>
                  {item.icon}
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ),
        label: (
          <SettingsSearchAnchor id={'appearance-context-menu'}>
            {t('settingAppearance.contextMenuMode.title')}
          </SettingsSearchAnchor>
        ),
        minWidth: undefined,
        name: 'contextMenuMode',
        trigger: 'onValueChange',
        valuePropName: 'value',
      },

      {
        children: (
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', justifyContent: 'flex-end' }}
          >
            <div className="flex w-1/2 items-center gap-1">
              <Select
                items={localeOptions}
                value={general?.responseLanguage || null}
                onValueChange={(value) =>
                  save(() => setSettings({ general: { responseLanguage: value ?? '' } }))
                }
              >
                <SelectTrigger
                  aria-label={t('settingCommon.responseLanguage.title')}
                  className="w-full"
                >
                  <SelectValue placeholder={t('settingCommon.responseLanguage.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {localeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {general?.responseLanguage && (
                <Button
                  aria-label={t('reset', { ns: 'common' })}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => save(() => setSettings({ general: { responseLanguage: '' } }))}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          </div>
        ),
        label: (
          <SettingsSearchAnchor id={'appearance-response-language'}>
            {t('settingCommon.responseLanguage.title')}
          </SettingsSearchAnchor>
        ),
      },
    ],
    extra: <AutoSaveHint lastUpdatedTime={lastSavedAt} saveStatus={saveStatus} onRetry={retry} />,
    title: t('settingCommon.title'),
  };

  return (
    <Form
      collapsible={false}
      initialValues={general}
      items={[themeFormGroup]}
      itemsType={'group'}
      variant={'filled'}
      onValuesChange={(v) => save(() => setSettings({ general: v }))}
      {...FORM_STYLE}
    />
  );
});

export default Common;
