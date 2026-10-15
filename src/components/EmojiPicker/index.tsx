'use client';

import { cn } from 'cn';
import { SmileIcon, TrashIcon, UploadIcon } from 'lucide-react';
import { lazy, memo, type ReactNode, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar, { type AvatarProps } from '@/components/Avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';

import AvatarUploader from './AvatarUploader';

// The emoji grid carries the emoji-mart dataset (~600 KB); load it when the
// popover first opens so the picker never sits inside a route's static closure.
const EmojiMartPanel = lazy(() => import('./EmojiMartPanel'));

export interface EmojiPickerCustomTab {
  label: ReactNode;
  render: (handleAvatarChange: (avatar: string) => void) => ReactNode;
  value: string;
}

export interface EmojiPickerProps extends Omit<AvatarProps, 'avatar' | 'onChange' | 'size'> {
  allowDelete?: boolean;
  /** Offer an upload tab; `{ enableEmoji: false }` hides the emoji tab. */
  allowUpload?: boolean | { enableEmoji?: boolean };
  /** Edge length of the cropped upload, in pixels. */
  compressSize?: number;
  /** Replace the avatar trigger with a caller-owned node. */
  customRender?: (avatar: string) => ReactNode;
  customTabs?: EmojiPickerCustomTab[];
  /** Initial value when uncontrolled, and the value a delete restores. */
  defaultAvatar?: string;
  defaultOpen?: boolean;
  /** Ignore open requests while the trigger shows a pending upload. */
  loading?: boolean;
  /** Defaults to the app language. */
  locale?: string;
  onChange?: (emoji: string) => void;
  onDelete?: () => void;
  onOpenChange?: (open: boolean) => void;
  onUpload?: (file: File) => void;
  open?: boolean;
  size?: number;
  value?: string;
}

const tabClass =
  'relative flex size-8 cursor-pointer items-center justify-center rounded-(--radius-card) border-0 bg-transparent p-0 text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground aria-selected:text-foreground aria-selected:after:absolute aria-selected:after:inset-x-1 aria-selected:after:-bottom-1 aria-selected:after:h-0.75 aria-selected:after:rounded-t-[3px] aria-selected:after:bg-primary aria-selected:after:content-[""]';

/**
 * Avatar picker: a popover with an emoji grid, an optional image upload with a
 * square crop, caller tabs and a delete action. `value` and `open` are each
 * controlled when passed.
 */
export const EmojiPicker = memo<EmojiPickerProps>(
  ({
    allowDelete,
    allowUpload,
    className,
    compressSize = 256,
    customRender,
    customTabs = [],
    defaultAvatar,
    defaultOpen = false,
    loading,
    locale: localeProp,
    onChange,
    onDelete,
    onOpenChange,
    onUpload,
    open: openProp,
    shape = 'square',
    size = 40,
    value,
    ...rest
  }) => {
    const { t } = useTranslation('ui');
    const appLocale = useGlobalStore(globalGeneralSelectors.currentLanguage);
    const locale = localeProp ?? appLocale ?? 'en-US';

    const [innerOpen, setInnerOpen] = useState(defaultOpen);
    const open = openProp ?? innerOpen;
    const setOpen = (next: boolean) => {
      if (openProp === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    };

    const [innerValue, setInnerValue] = useState(defaultAvatar ?? '');
    const avatar = value ?? innerValue;

    const enableEmoji = !(typeof allowUpload === 'object' && allowUpload.enableEmoji === false);
    const tabs = [
      enableEmoji && { icon: SmileIcon, key: 'emoji', label: t('emojiPicker.emoji') },
      allowUpload && { icon: UploadIcon, key: 'upload', label: t('emojiPicker.upload') },
    ].filter(Boolean) as { icon: typeof SmileIcon; key: string; label: string }[];
    const showTabs = allowDelete || tabs.length + customTabs.length > 1;
    const [tab, setTab] = useState(enableEmoji ? 'emoji' : allowUpload ? 'upload' : '');

    const handleAvatarChange = (next: string) => {
      if (value === undefined) setInnerValue(next);
      onChange?.(next);
      setOpen(false);
    };

    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (loading) return;
          setOpen(next);
        }}
      >
        <PopoverTrigger
          nativeButton={false}
          render={
            customRender ? (
              <span className="inline-flex">{customRender(avatar)}</span>
            ) : (
              <Avatar
                avatar={avatar}
                loading={loading}
                shape={shape}
                size={size}
                className={cn(
                  'relative cursor-pointer transition-colors duration-150 hover:bg-selected motion-reduce:transition-none',
                  className,
                )}
                {...rest}
              />
            )
          }
        />
        <PopoverContent className="w-fit min-w-77.5 gap-0 overflow-hidden p-0" sideOffset={8}>
          {showTabs && (
            <div className="flex items-center justify-between border-be border-divider px-2.5 pbs-1">
              <div className="flex gap-2 p-1" role="tablist">
                {tabs.map(({ icon: Icon, key, label }) => (
                  <button
                    aria-label={label}
                    aria-selected={tab === key}
                    className={tabClass}
                    key={key}
                    role="tab"
                    title={label}
                    type="button"
                    onClick={() => setTab(key)}
                  >
                    <Icon size={20} strokeWidth={2.5} />
                  </button>
                ))}
                {customTabs.map((item) => (
                  <button
                    aria-selected={tab === item.value}
                    className={tabClass}
                    key={item.value}
                    role="tab"
                    type="button"
                    onClick={() => setTab(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {allowDelete && (
                <ActionIcon
                  icon={TrashIcon}
                  size={{ blockSize: 32, size: 18 }}
                  title={t('emojiPicker.delete')}
                  onClick={() => {
                    handleAvatarChange(defaultAvatar ?? '');
                    onDelete?.();
                  }}
                />
              )}
            </div>
          )}
          {tab === 'emoji' && (
            <Suspense fallback={<Skeleton className="h-108 w-88" />}>
              <EmojiMartPanel
                locale={locale}
                navPosition={showTabs ? 'bottom' : 'top'}
                onSelect={handleAvatarChange}
              />
            </Suspense>
          )}
          {tab === 'upload' && (
            <AvatarUploader
              compressSize={compressSize}
              shape={shape}
              onChange={handleAvatarChange}
              onUpload={onUpload}
            />
          )}
          {customTabs.map(
            (item) =>
              tab === item.value && (
                <div className="flex p-2.5" key={item.value}>
                  {item.render(handleAvatarChange)}
                </div>
              ),
          )}
        </PopoverContent>
      </Popover>
    );
  },
);
EmojiPicker.displayName = 'EmojiPicker';

export default EmojiPicker;
