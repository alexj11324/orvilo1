'use client';

import { createStaticStyles } from 'antd-style';
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

const styles = createStaticStyles(({ css, cssVar }) => ({
  header: css`
    flex-shrink: 0;
    padding-block: 10px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  tabsBar: css`
    flex-shrink: 0;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

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
      <div className="flex flex-col h-full" style={{ overflow: 'hidden' }}>
        <div className={`flex items-center justify-between ${styles.header}`}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            {icon ?? <Avatar avatar={avatar} background={background} shape={'square'} size={24} />}
            <div className="truncate font-semibold">{title}</div>
          </div>
          <ActionIcon icon={XIcon} title={t('cancel')} onClick={close} />
        </div>

        {tabItems && tabItems.length >= 2 && (
          <div className={`flex flex-col ${styles.tabsBar}`}>
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

        <div
          className="flex flex-col flex-1"
          style={{ paddingInline: 16, minHeight: 0, overflow: 'auto' }}
        >
          {children}
        </div>
      </div>
    );
  },
);

export default SettingsModalLayout;
