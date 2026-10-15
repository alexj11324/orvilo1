import data from '@emoji-mart/data';
import locale_ar from '@emoji-mart/data/i18n/ar.json';
import locale_be from '@emoji-mart/data/i18n/be.json';
import locale_cs from '@emoji-mart/data/i18n/cs.json';
import locale_de from '@emoji-mart/data/i18n/de.json';
import english from '@emoji-mart/data/i18n/en.json';
import locale_es from '@emoji-mart/data/i18n/es.json';
import locale_fa from '@emoji-mart/data/i18n/fa.json';
import locale_fi from '@emoji-mart/data/i18n/fi.json';
import locale_fr from '@emoji-mart/data/i18n/fr.json';
import locale_hi from '@emoji-mart/data/i18n/hi.json';
import locale_it from '@emoji-mart/data/i18n/it.json';
import locale_ja from '@emoji-mart/data/i18n/ja.json';
import locale_ko from '@emoji-mart/data/i18n/ko.json';
import locale_nl from '@emoji-mart/data/i18n/nl.json';
import locale_pl from '@emoji-mart/data/i18n/pl.json';
import locale_pt from '@emoji-mart/data/i18n/pt.json';
import locale_ru from '@emoji-mart/data/i18n/ru.json';
import locale_sa from '@emoji-mart/data/i18n/sa.json';
import locale_tr from '@emoji-mart/data/i18n/tr.json';
import locale_uk from '@emoji-mart/data/i18n/uk.json';
import locale_vi from '@emoji-mart/data/i18n/vi.json';
import locale_zh from '@emoji-mart/data/i18n/zh.json';
import { isValidElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMergeState from 'use-merge-value';

import Avatar from '@/components/Avatar';
import { getLobeIconCDN } from '@/components/BrandIcons';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsDark } from '@/hooks/useIsDark';

import { toc } from '../../../packages/brand-icons/src/toc';
import AvatarUploader from './AvatarUploader';
import ThemedEmojiPicker from './ThemedEmojiPicker';
import type { EmojiPickerProps } from './types';

const localeData = {
  ar: locale_ar,
  be: locale_be,
  cs: locale_cs,
  de: locale_de,
  en: english,
  es: locale_es,
  fa: locale_fa,
  fi: locale_fi,
  fr: locale_fr,
  hi: locale_hi,
  it: locale_it,
  ja: locale_ja,
  ko: locale_ko,
  nl: locale_nl,
  pl: locale_pl,
  pt: locale_pt,
  ru: locale_ru,
  sa: locale_sa,
  tr: locale_tr,
  uk: locale_uk,
  vi: locale_vi,
  zh: locale_zh,
};
const NativeEmojiPicker = ({
  value,
  defaultAvatar = null,
  onChange,
  allowUpload,
  allowDelete,
  allowModelAvatar,
  texts,
  onDelete,
  compressSize,
  customEmojis,
  loading,
  onUpload,
  customTabs = [],
  customRender,
  open,
  defaultOpen = false,
  onOpenChange,
  popupClassName,
  popupStyle,
  popupProps,
  contentProps,
  locale = 'en-US',
  shape = 'square',
  ...avatarProps
}: EmojiPickerProps) => {
  const { t } = useTranslation('ui');
  const dark = useIsDark();
  const language = locale.split('-')[0];
  const i18n = localeData[language as keyof typeof localeData] ?? english;
  const [visible, setVisible] = useMergeState(defaultOpen, {
    defaultValue: defaultOpen,
    value: open,
    onChange: onOpenChange,
  });
  const [avatar, setAvatar] = useMergeState<string | null>(defaultAvatar, {
    value,
    defaultValue: defaultAvatar,
    onChange: (next) => onChange?.(next ?? ''),
  });
  const emojiEnabled = !(typeof allowUpload === 'object' && allowUpload.enableEmoji === false);
  const [tab, setTab] = useState(emojiEnabled ? 'emoji' : 'upload');
  const change = (next: string) => {
    setAvatar(next);
    setVisible(false);
  };
  const modelCategory = {
    id: 'models',
    name: 'Models / Providers',
    emojis: toc
      .filter((item) => item.group !== 'application')
      .map((item) => ({
        id: item.id.toLowerCase(),
        name: item.title,
        keywords: [item.title, item.id, item.fullTitle],
        skins: [{ src: getLobeIconCDN(item.id, { format: 'avatar', cdn: 'aliyun' }) }],
      })),
  };
  const custom = allowModelAvatar ? [modelCategory, ...(customEmojis ?? [])] : customEmojis;
  const tabs = [
    ...(emojiEnabled ? [{ value: 'emoji', label: texts?.emoji ?? t('emojiPicker.emoji') }] : []),
    ...(allowUpload ? [{ value: 'upload', label: texts?.upload ?? t('emojiPicker.upload') }] : []),
    ...customTabs.map(({ label, value }) => ({ label, value })),
  ];
  const customTrigger = customRender?.(avatar ?? '');
  return (
    <Popover
      open={visible}
      onOpenChange={(next) => {
        if (!loading) setVisible(next);
      }}
    >
      <PopoverTrigger
        nativeButton={false}
        render={
          isValidElement(customTrigger) ? (
            customTrigger
          ) : (
            <Avatar
              {...avatarProps}
              avatar={avatar}
              className={`cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${avatarProps.className ?? ''}`}
              loading={loading}
              shape={shape}
            />
          )
        }
      />
      <PopoverContent
        {...popupProps}
        className={`min-w-77.5 w-fit p-0 ${popupClassName ?? ''}`}
        side={popupProps?.side ?? 'bottom'}
        style={popupStyle}
      >
        {(allowDelete || tabs.length > 1) && (
          <div className="flex items-center justify-between gap-2 px-2.5 pt-1">
            <Tabs value={tab} onValueChange={(next) => setTab(String(next))}>
              <TabsList>
                {tabs.map(({ label, value }) => (
                  <TabsTrigger key={value} value={value}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {allowDelete && (
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  setAvatar(defaultAvatar);
                  setVisible(false);
                  onDelete?.();
                }}
              >
                {texts?.delete ?? t('emojiPicker.delete')}
              </Button>
            )}
          </div>
        )}
        <div
          style={
            contentProps
              ? { gap: contentProps.gap, padding: contentProps.padding, width: contentProps.width }
              : undefined
          }
        >
          {tab === 'emoji' && emojiEnabled && (
            <ThemedEmojiPicker
              custom={custom}
              data={data}
              i18n={i18n}
              icons="outline"
              locale={locale.split('-')[0]}
              navPosition={allowDelete || tabs.length > 1 ? 'bottom' : 'top'}
              previewPosition="none"
              skinTonePosition="none"
              theme={dark ? 'dark' : 'light'}
              onEmojiSelect={(emoji: { src?: string; native: string }) =>
                change(emoji.src || emoji.native)
              }
            />
          )}
          {tab === 'upload' && allowUpload && (
            <AvatarUploader
              compressSize={compressSize}
              shape={shape}
              texts={texts}
              onChange={change}
              onUpload={onUpload}
            />
          )}
          {customTabs.map((item) =>
            tab === item.value ? (
              <div className="p-2.5" key={item.value}>
                {item.render(change)}
              </div>
            ) : null,
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
export default NativeEmojiPicker;
