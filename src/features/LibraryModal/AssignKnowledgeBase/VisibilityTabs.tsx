'use client';

import { cn } from 'cn';
import { LockIcon, UsersIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

export type PickerVisibility = 'private' | 'public';

interface VisibilityTabsProps {
  onChange: (value: PickerVisibility) => void;
  value: PickerVisibility;
}

const styles = {
  button: 'px-3 text-sm leading-5.5 font-medium text-muted-foreground hover:bg-accent',
  buttonActive: 'text-foreground bg-selected hover:bg-selected',
  group: 'inline-flex p-1 rounded-(--radius-card) bg-fill-quaternary',
};

// Keep the picker's existing visibility iconography and label copy.
const OPTIONS: Array<{ icon: typeof LockIcon; key: PickerVisibility; labelKey: string }> = [
  { icon: UsersIcon, key: 'public', labelKey: 'resources.visibility.workspace' },
  { icon: LockIcon, key: 'private', labelKey: 'resources.visibility.private' },
];

const VisibilityTabs = memo<VisibilityTabsProps>(({ value, onChange }) => {
  const { t } = useTranslation('chat');

  return (
    <div className={styles.group} role={'tablist'}>
      {OPTIONS.map((option) => {
        const isActive = value === option.key;
        const OptionIcon = option.icon;
        return (
          <Button
            aria-selected={isActive}
            className={cn(styles.button, isActive && styles.buttonActive)}
            key={option.key}
            role={'tab'}
            size="normal"
            type={'button'}
            variant="ghost"
            onClick={() => {
              if (isActive) return;
              onChange(option.key);
            }}
          >
            <span className="anticon" role="img">
              <OptionIcon
                className="size-4"
                fill={'transparent'}
                height={16}
                size={16}
                width={16}
              />
            </span>
            <span>{t(option.labelKey as never)}</span>
          </Button>
        );
      })}
    </div>
  );
});

VisibilityTabs.displayName = 'VisibilityTabs';

export default VisibilityTabs;
