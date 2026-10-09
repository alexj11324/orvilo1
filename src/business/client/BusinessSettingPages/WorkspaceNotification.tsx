'use client';

import { type NotificationSettings, WORK_NOTIFICATION_EVENTS } from '@orvilo/types';
import { Bell, MonitorSmartphone } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { FormGroup } from '@/components/GroupForm';
import NotificationSettingsSkeleton from '@/components/Skeleton/Settings/Notification';
import { Switch } from '@/components/ui/switch';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';

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
    icon: MonitorSmartphone,
    key: 'push',
    labelKey: 'workspaceSetting.notification.push',
  },
] as const satisfies readonly ChannelDef[];

export const WorkspaceNotification = ({ personal = false }: { personal?: boolean }) => {
  const { t } = useTranslation('setting');
  const id = useId();
  const { status, save, retry, lastSavedAt } = useSaveState();
  const useFetchWorkspaceUserPreference = useUserStore((s) => s.useFetchWorkspaceUserPreference);
  const preferenceQuery = useFetchWorkspaceUserPreference();
  const updateWorkspaceUserPreference = useUserStore((s) => s.updateWorkspaceUserPreference);
  const settings = useUserStore((s) => s.settings.notification);
  const setSettings = useUserStore((s) => s.setSettings);
  const notification = (personal ? settings : preferenceQuery.data?.notification) ?? {};

  const patch = (partial: NotificationSettings) =>
    save(() =>
      personal
        ? setSettings({ notification: partial })
        : updateWorkspaceUserPreference({ notification: partial }),
    );

  return (
    <AsyncBoundary
      data={personal ? settings : preferenceQuery.data}
      error={personal ? undefined : preferenceQuery.error}
      isLoading={!personal && preferenceQuery.data === undefined && !preferenceQuery.error}
      loading={<NotificationSettingsSkeleton workspace={!personal} />}
      onRetry={() => void preferenceQuery.mutate()}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-160 flex-col gap-8">
        {!personal && (
          <h1 className="m-0 text-xl font-semibold">{t('workspaceSetting.notification.title')}</h1>
        )}
        {status !== 'idle' && (
          <div aria-live="polite" className="flex justify-end">
            <AutoSaveHint
              lastUpdatedTime={lastSavedAt}
              saveStatus={status}
              onRetry={() => void retry()}
            />
          </div>
        )}
        {CHANNELS.map((def) => {
          const channel = notification[def.key];
          return (
            <FormGroup
              icon={def.icon}
              key={def.key}
              title={t(def.labelKey)}
              extra={
                <Switch
                  aria-label={t(def.labelKey)}
                  checked={channel?.enabled !== false}
                  onCheckedChange={(value) => patch({ [def.key]: { enabled: value } })}
                />
              }
            >
              <p className="m-0 text-sm text-muted-foreground">{t(def.descriptionKey)}</p>
              <div className="divide-y divide-border">
                {WORK_NOTIFICATION_EVENTS.map((event) => (
                  <div
                    className="flex min-h-11 items-center justify-between gap-4 py-3 text-sm"
                    key={event}
                  >
                    <label className="flex-1 cursor-pointer" htmlFor={`${id}-${def.key}-${event}`}>
                      <span className="sr-only">{t(def.labelKey)}: </span>
                      {t(`notification.events.${event}`)}
                    </label>
                    <Switch
                      checked={channel?.items?.work?.[event] !== false}
                      disabled={channel?.enabled === false}
                      id={`${id}-${def.key}-${event}`}
                      onCheckedChange={(value) =>
                        patch({ [def.key]: { items: { work: { [event]: value } } } })
                      }
                    />
                  </div>
                ))}
              </div>
            </FormGroup>
          );
        })}
      </div>
    </AsyncBoundary>
  );
};

export default WorkspaceNotification;
