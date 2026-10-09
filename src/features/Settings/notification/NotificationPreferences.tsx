'use client';

import {
  type NotificationChannelSettings,
  type NotificationSettings,
  WORK_NOTIFICATION_EVENTS,
} from '@orvilo/types';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

/** Channels with a working delivery path. Email has no sender yet, so it is not offered. */
const CHANNELS = ['inbox', 'push'] as const;

type Channel = (typeof CHANNELS)[number];

const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(2,5.5rem)] items-center gap-x-2';

interface NotificationPreferencesProps {
  /** Receives only the changed leaf; the owner merges it into the stored settings. */
  onChange: (partial: NotificationSettings) => void;
  value: NotificationSettings;
}

/**
 * Event × channel matrix shared by the personal and the workspace notification
 * pages. Presentational only: each page owns where the value is read and saved.
 */
const NotificationPreferences = ({ onChange, value }: NotificationPreferencesProps) => {
  const { t } = useTranslation('setting');

  const channelOf = (channel: Channel): NotificationChannelSettings | undefined => value[channel];
  const channelOn = (channel: Channel) => channelOf(channel)?.enabled !== false;

  return (
    <div className="text-sm" role="table">
      <div className={`${GRID} pb-2 text-xs text-muted-foreground`} role="row">
        <span role="columnheader">{t('notification.matrix.event')}</span>
        {CHANNELS.map((channel) => (
          <span className="text-center" key={channel} role="columnheader">
            {t(`notification.matrix.${channel}`)}
          </span>
        ))}
      </div>
      <div className={`${GRID} min-h-11 border-t border-border py-2 font-medium`} role="row">
        <span role="rowheader">{t('notification.matrix.all')}</span>
        {CHANNELS.map((channel) => (
          <span className="flex justify-center" key={channel} role="cell">
            <Switch
              checked={channelOn(channel)}
              aria-label={t('notification.matrix.cell', {
                channel: t(`notification.matrix.${channel}`),
                event: t('notification.matrix.all'),
              })}
              onCheckedChange={(enabled) => onChange({ [channel]: { enabled } })}
            />
          </span>
        ))}
      </div>
      {WORK_NOTIFICATION_EVENTS.map((event) => (
        <div className={`${GRID} min-h-11 border-t border-border py-2`} key={event} role="row">
          <span role="rowheader">{t(`notification.events.${event}`)}</span>
          {CHANNELS.map((channel) => (
            <span className="flex justify-center" key={channel} role="cell">
              <Checkbox
                checked={channelOf(channel)?.items?.work?.[event] !== false}
                disabled={!channelOn(channel)}
                aria-label={t('notification.matrix.cell', {
                  channel: t(`notification.matrix.${channel}`),
                  event: t(`notification.events.${event}`),
                })}
                onCheckedChange={(checked) =>
                  onChange({ [channel]: { items: { work: { [event]: checked === true } } } })
                }
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

export default NotificationPreferences;
