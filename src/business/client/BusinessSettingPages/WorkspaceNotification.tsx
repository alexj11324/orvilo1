'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Switch, Text } from '@lobehub/ui/base-ui';
import type {
  IMNotificationChannelSettings,
  NotificationChannelSettings,
  NotificationSettings,
} from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { Bell, Mail, MessageSquareText, Smartphone } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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
  key: keyof Omit<NotificationSettings, 'im'>;
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
    descriptionKey: 'workspaceSetting.notification.emailDesc',
    icon: Mail,
    key: 'email',
    labelKey: 'workspaceSetting.notification.email',
  },
  {
    descriptionKey: 'workspaceSetting.notification.pushDesc',
    icon: Smartphone,
    key: 'push',
    labelKey: 'workspaceSetting.notification.push',
  },
] as const satisfies readonly ChannelDef[];

const humanize = (key: string) => key.replaceAll(/[-_]/g, ' ');

const ItemRows = memo<{
  channel: NotificationChannelSettings;
  onToggle: (category: string, item: string, value: boolean) => void;
}>(({ channel, onToggle }) => {
  const categories = channel.items;
  if (!categories) return null;
  return (
    <>
      {Object.entries(categories).map(([category, items]) =>
        Object.entries(items ?? {}).map(([item, enabled]) => (
          <Flexbox
            horizontal
            align="center"
            className={styles.itemRow}
            justify="space-between"
            key={`${category}.${item}`}
          >
            <Text className={styles.itemLabel}>
              {humanize(category)} · {humanize(item)}
            </Text>
            <Switch
              checked={enabled !== false}
              size="small"
              onChange={(value: boolean) => onToggle(category, item, value)}
            />
          </Flexbox>
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
    <Flexbox gap={0}>
      <Flexbox
        horizontal
        align="center"
        className={styles.channelRow}
        gap={12}
        justify="space-between"
      >
        <Flexbox horizontal align="center" gap={10}>
          <Icon icon={def.icon} size={16} />
          <Flexbox gap={0}>
            <Text className={styles.channelLabel}>{t(def.labelKey)}</Text>
            <Text fontSize={12} type="secondary">
              {t(def.descriptionKey)}
            </Text>
          </Flexbox>
        </Flexbox>
        <Switch
          checked={settings?.enabled !== false}
          onChange={(value: boolean) => onToggleChannel(def.key, value)}
        />
      </Flexbox>
      <ItemRows
        channel={settings ?? {}}
        onToggle={(category, item, value) => onToggleItem(def.key, category, item, value)}
      />
    </Flexbox>
  );
});

export const WorkspaceNotification = memo(() => {
  const { t } = useTranslation('setting');
  const useFetchWorkspaceUserPreference = useUserStore((s) => s.useFetchWorkspaceUserPreference);
  useFetchWorkspaceUserPreference();
  const preference = useUserStore((s) => s.workspaceUserPreference);
  const updateWorkspaceUserPreference = useUserStore((s) => s.updateWorkspaceUserPreference);
  const notification = useMemo(() => preference.notification ?? {}, [preference.notification]);
  const imPlatforms = (notification.im as IMNotificationChannelSettings | undefined)?.platforms;

  const patch = (partial: NotificationSettings) =>
    updateWorkspaceUserPreference({ notification: partial });

  return (
    <Flexbox className={styles.container}>
      <Text className={styles.pageTitle}>{t('workspaceSetting.notification.title')}</Text>
      <Flexbox className={styles.section}>
        <Text className={styles.groupTitle}>{t('workspaceSetting.notification.channels')}</Text>
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
      </Flexbox>
      {imPlatforms && Object.keys(imPlatforms).length > 0 && (
        <Flexbox className={styles.section}>
          <Text className={styles.groupTitle}>{t('workspaceSetting.notification.im')}</Text>
          <Text className={styles.sectionHint}>{t('workspaceSetting.notification.imDesc')}</Text>
          {Object.entries(imPlatforms).map(([platform, platformSettings]) => (
            <Flexbox
              horizontal
              align="center"
              className={styles.channelRow}
              gap={12}
              justify="space-between"
              key={platform}
            >
              <Flexbox horizontal align="center" gap={10}>
                <Icon icon={MessageSquareText} size={16} />
                <Text className={styles.channelLabel}>{humanize(platform)}</Text>
              </Flexbox>
              <Switch
                checked={platformSettings?.enabled !== false}
                onChange={(value: boolean) =>
                  patch({ im: { platforms: { [platform]: { enabled: value } } } })
                }
              />
            </Flexbox>
          ))}
        </Flexbox>
      )}
    </Flexbox>
  );
});

WorkspaceNotification.displayName = 'WorkspaceNotification';

export default WorkspaceNotification;
