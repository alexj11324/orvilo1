'use client';

import { type LucideIcon, XIcon } from 'lucide-react';
import { createElement, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { useModalContext } from '@/components/Modal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface SettingsModalTabItem {
  icon?: LucideIcon;
  key: string;
  label: ReactNode;
}

export interface SettingsModalLayoutProps {
  activeTab?: string;
  avatar: string;
  background?: string;
  children: ReactNode;
  icon?: ReactNode;
  onTabChange?: (key: string) => void;
  tabs?: SettingsModalTabItem[];
  title: ReactNode;
}

const SettingsModalLayout = memo<SettingsModalLayoutProps>(
  ({ avatar, background, title, tabs, activeTab, onTabChange, children, icon }) => {
    const { t } = useTranslation('common');
    const { close } = useModalContext();

    const tabItems = tabs?.map(({ icon, key, label }) => ({
      icon: icon ? createElement(icon, { size: 16 }) : undefined,
      key,
      label,
    }));

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-divider px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {icon ?? <Avatar avatar={avatar} background={background} shape={'square'} size={24} />}
            <div className="truncate text-sm leading-5.5 font-semibold text-foreground">
              {title}
            </div>
          </div>
          <ActionIcon
            icon={XIcon}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('cancel')}
            onClick={close}
          />
        </div>

        {tabItems && tabItems.length >= 2 && (
          <div className="flex shrink-0 flex-col border-b border-divider px-3">
            <Tabs value={activeTab} onValueChange={onTabChange}>
              <TabsList>
                {tabItems.map((item) => (
                  <TabsTrigger key={item.key} value={item.key}>
                    {item.icon}
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4">{children}</div>
      </div>
    );
  },
);

export default SettingsModalLayout;
