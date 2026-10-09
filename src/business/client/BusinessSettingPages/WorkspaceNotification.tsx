'use client';

import {
  type NotificationChannelSettings,
  type NotificationSettings,
  WORK_NOTIFICATION_EVENTS,
} from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { Bell, Smartphone } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Switch } from '@/components/ui/switch';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';

const styles = createStaticStyles(({ css, cssVar }) => ({
  channelLabel: css`
    font-size: 13px;
    font-weight: 500;
  `,
  channelRow: css`
    padding-block: 10px;
    padding-inline: 0;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  container: css`
    width: 100%;
    max-width: 640px;
    margin-inline: auto;
    padding-block: 24px;
    padding-inline: 24px;
  `,
  groupTitle: css`
    margin-block-end: 4px;
    font-size: 15px;
    font-weight: 600;
  `,
  itemLabel: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
    text-transform: capitalize;
  `,
  itemRow: css`
    padding-block: 6px;
    padding-inline-start: 24px;
  `,
  pageTitle: css`
    margin-block-end: 24px;
    font-size: 20px;
    font-weight: 600;
  `,
  section: css`
    margin-block-end: 24px;
  `,
  sectionHint: css`
    margin-block-end: 8px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

interface ChannelDef {
  descriptionKey: string;
  icon: typeof Bell;
  key: keyof NotificationSettings;
  labelKey: string;
}

const CHANNELS = [
  {
    descriptionKey: 'workspaceSetting.notification.inboxDesc',
    icon: Bell,
    key: 'inbox',
    labelKey: 'workspaceSetting.notification.inbox',
  },
  {
    descriptionKey: 'workspaceSetting.notification.pushDesc',
    icon: Smartphone,
    key: 'push',
    labelKey: 'workspaceSetting.notification.push',
  },
] as const satisfies readonly ChannelDef[];

const ItemRows = memo<{
  channel: NotificationChannelSettings;
  onToggle: (category: string, item: string, value: boolean) => void;
}>(({ channel, onToggle }) => {
  const { t } = useTranslation('setting');
  const categories = {
    work: Object.fromEntries(
      WORK_NOTIFICATION_EVENTS.map((event) => [event, channel.items?.work?.[event] !== false]),
    ),
  };
  if (!categories) return null;
  return (
    <>
      {Object.entries(categories).map(([category, items]) =>
        Object.entries(items ?? {}).map(([item, enabled]) => (
          <div
            className={`${styles.itemRow} flex items-center justify-between`}
            key={`${category}.${item}`}
          >
            <div className={cn(styles.itemLabel)}>
              {t(`notification.events.${item as (typeof WORK_NOTIFICATION_EVENTS)[number]}`)}
            </div>
            <Switch
              checked={enabled !== false}
              disabled={channel.enabled === false}
              size="sm"
              aria-label={t(
                `notification.events.${item as (typeof WORK_NOTIFICATION_EVENTS)[number]}`,
              )}
              onCheckedChange={(value: boolean) => onToggle(category, item, value)}
            />
          </div>
        )),
      )}
    </>
  );
});

const ChannelRow = memo<{
  def: (typeof CHANNELS)[number];
  settings: NotificationChannelSettings | undefined;
  onToggleChannel: (key: ChannelDef['key'], value: boolean) => void;
  onToggleItem: (key: ChannelDef['key'], category: string, item: string, value: boolean) => void;
}>(({ def, settings, onToggleChannel, onToggleItem }) => {
  const { t } = useTranslation('setting');
  return (
    <div className="flex flex-col">
      <div className={`${styles.channelRow} flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5">
          <def.icon size={16} />
          <div className="flex flex-col">
            <div className={cn(styles.channelLabel)}>{t(def.labelKey)}</div>
            <div className="text-[12px] text-muted-foreground">{t(def.descriptionKey)}</div>
          </div>
        </div>
        <Switch
          aria-label={t(def.labelKey)}
          checked={settings?.enabled !== false}
          onCheckedChange={(value: boolean) => onToggleChannel(def.key, value)}
        />
      </div>
      <ItemRows
        channel={settings ?? {}}
        onToggle={(category, item, value) => onToggleItem(def.key, category, item, value)}
      />
    </div>
  );
});

export const WorkspaceNotification = memo(({ personal = false }: { personal?: boolean }) => {
  const { t } = useTranslation('setting');
  const { status, save, retry, lastSavedAt } = useSaveState();
  const useFetchWorkspaceUserPreference = useUserStore((s) => s.useFetchWorkspaceUserPreference);
  useFetchWorkspaceUserPreference();
  const preference = useUserStore((s) => s.workspaceUserPreference);
  const updateWorkspaceUserPreference = useUserStore((s) => s.updateWorkspaceUserPreference);
  const settings = useUserStore((s) => s.settings.notification);
  const setSettings = useUserStore((s) => s.setSettings);
  const notification = useMemo(
    () => (personal ? settings : preference.notification) ?? {},
    [personal, settings, preference.notification],
  );

  const patch = (partial: NotificationSettings) =>
    save(() =>
      personal
        ? setSettings({ notification: partial })
        : updateWorkspaceUserPreference({ notification: partial }),
    );

  return (
    <div className={`${styles.container} flex flex-col`}>
      <div className={cn(styles.pageTitle)}>{t('workspaceSetting.notification.title')}</div>
      <AutoSaveHint
        lastUpdatedTime={lastSavedAt}
        saveStatus={status}
        onRetry={() => void retry()}
      />
      <div className={`${styles.section} flex flex-col`}>
        <div className={cn(styles.groupTitle)}>{t('workspaceSetting.notification.channels')}</div>
        {CHANNELS.map((def) => (
          <ChannelRow
            def={def}
            key={def.key}
            settings={notification[def.key]}
            onToggleChannel={(key, value) => patch({ [key]: { enabled: value } })}
            onToggleItem={(key, category, item, value) =>
              patch({ [key]: { items: { [category]: { [item]: value } } } })
            }
          />
        ))}
      </div>
    </div>
  );
});

WorkspaceNotification.displayName = 'WorkspaceNotification';

export default WorkspaceNotification;
