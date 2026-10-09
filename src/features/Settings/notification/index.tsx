import {
  COMPLETION_BUILTIN_SOUNDS,
  type CompletionSoundSettings,
} from '@orvilo/electron-client-ipc';
import { isHostUnsupportedResult } from '@orvilo/types';
import { CircleAlert, Play } from 'lucide-react';
import { createElement, useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import BusinessNotification from '@/business/client/BusinessSettingPages/Notification';
import { WorkspaceNotification } from '@/business/client/BusinessSettingPages/WorkspaceNotification';
import Form from '@/components/GroupForm';
import { NotificationSoundSkeleton } from '@/components/Skeleton/Settings/Notification';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FORM_STYLE } from '@/const/layoutTokens';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { getHostPort } from '@/platform';
import { completionSoundService } from '@/services/electron/completionSound';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';

const IMPORTED = 'imported';
const IMPORT = 'import';

export const DesktopNotificationSettings = () => {
  const { t } = useTranslation('setting');
  const soundToggleId = useId();
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const [settings, setSettings] = useState<CompletionSoundSettings>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const report = useCallback(async (action: () => Promise<CompletionSoundSettings | void>) => {
    setError(false);
    try {
      const next = await action();
      if (next) setSettings(next);
    } catch (error) {
      console.error('Completion sound setting failed:', error);
      setError(true);
    }
  }, []);

  /** Only state-changing actions lock the form; playing a sound changes nothing. */
  const run = async (action: () => Promise<CompletionSoundSettings | void>) => {
    setBusy(true);
    try {
      await report(action);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void report(completionSoundService.getSettings);
  }, [report]);

  const previewBanner = () =>
    report(async () => {
      const result = await getHostPort().notification.show({
        body: t('completionSound.banner.previewBody'),
        // Settings is open, so the window has focus and the banner would be skipped.
        force: true,
        soundName: await completionSoundService.getNotificationSoundFile(),
        title: t('completionSound.banner.previewTitle'),
      });
      // A refused banner resolves instead of throwing, so an undelivered preview would
      // otherwise look like a dead button.
      if (isHostUnsupportedResult(result) || !result?.success)
        throw new Error(
          isHostUnsupportedResult(result)
            ? result.code
            : (result?.error ?? result?.reason ?? 'not delivered'),
        );
    });

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-160 flex-col gap-8">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{t('completionSound.error')}</AlertDescription>
          <AlertAction>
            {
              <Button variant="outline" onClick={() => run(completionSoundService.getSettings)}>
                {t('completionSound.retry')}
              </Button>
            }
          </AlertAction>
        </Alert>
      )}
      {!settings ? (
        !error && <NotificationSoundSkeleton />
      ) : (
        <Form
          collapsible={false}
          itemMinWidth={0}
          itemsType={'group'}
          style={FORM_STYLE.style}
          variant={'borderless'}
          items={[
            {
              children: [
                {
                  children: (
                    <div
                      className={'flex min-w-0 shrink-0'}
                      style={{ flexDirection: 'row', justifyContent: 'flex-end' }}
                    >
                      <Switch
                        checked={settings.enabled}
                        disabled={busy}
                        id={soundToggleId}
                        onCheckedChange={(enabled) =>
                          run(() => completionSoundService.setSettings({ enabled }))
                        }
                      />
                    </div>
                  ),
                  desc: t('completionSound.desc'),
                  htmlFor: soundToggleId,
                  label: (
                    <SettingsSearchAnchor id={'notification-completion-sound'}>
                      {t('completionSound.enabled')}
                    </SettingsSearchAnchor>
                  ),
                },
                {
                  children: (
                    <div
                      className={'flex min-w-0 shrink-0'}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                      }}
                    >
                      <Select
                        disabled={busy}
                        value={settings.name ? IMPORTED : settings.builtin}
                        items={[
                          ...(settings.name ? [{ label: settings.name, value: IMPORTED }] : []),
                          ...COMPLETION_BUILTIN_SOUNDS.map((value) => ({
                            label: t(`completionSound.builtin.${value}`),
                            value,
                          })),
                          { label: t('completionSound.import'), value: IMPORT },
                        ]}
                        onValueChange={(value) => {
                          if (value !== null)
                            ((value) => {
                              if (value === IMPORT) return run(completionSoundService.importSound);
                              const builtin = COMPLETION_BUILTIN_SOUNDS.find((id) => id === value);
                              if (builtin)
                                run(() => completionSoundService.setSettings({ builtin }));
                            })(value);
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            ...(settings.name ? [{ label: settings.name, value: IMPORTED }] : []),
                            ...COMPLETION_BUILTIN_SOUNDS.map((value) => ({
                              label: t(`completionSound.builtin.${value}`),
                              value,
                            })),
                            { label: t('completionSound.import'), value: IMPORT },
                          ].map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        aria-label={t('completionSound.preview')}
                        disabled={settings.volume === 0}
                        size="icon-lg"
                        title={t('completionSound.preview')}
                        variant="outline"
                        onClick={() => report(() => completionSoundService.play({ preview: true }))}
                      >
                        {createElement(Play)}
                      </Button>
                    </div>
                  ),
                  desc: t('completionSound.importHint'),
                  label: t('completionSound.sound'),
                },
                {
                  children: (
                    <Slider
                      aria-label={t('completionSound.volume')}
                      disabled={busy}
                      max={1}
                      min={0}
                      step={0.1}
                      style={{ width: '100%' }}
                      value={settings.volume}
                      onValueChange={(volume) =>
                        setSettings({
                          ...settings,
                          volume: typeof volume === 'number' ? volume : volume[0],
                        })
                      }
                      onValueCommitted={(volume) =>
                        run(() =>
                          completionSoundService.setSettings({
                            volume: typeof volume === 'number' ? volume : volume[0],
                          }),
                        )
                      }
                    />
                  ),
                  label: t('completionSound.volume'),
                  minWidth: FORM_STYLE.itemMinWidth,
                },
              ],
              title: t('completionSound.title'),
            },
            {
              children: [
                {
                  children: (
                    <div
                      className={'flex min-w-0 shrink-0'}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                      }}
                    >
                      <Button
                        aria-label={t('completionSound.preview')}
                        size="icon-lg"
                        title={t('completionSound.preview')}
                        variant="outline"
                        onClick={previewBanner}
                      >
                        {createElement(Play)}
                      </Button>
                      <ToggleGroup
                        disabled={busy}
                        value={[settings.notificationSound]}
                        onValueChange={(value) => {
                          const notificationSound =
                            value[0] as CompletionSoundSettings['notificationSound'];
                          if (notificationSound)
                            run(() => completionSoundService.setSettings({ notificationSound }));
                        }}
                      >
                        <ToggleGroupItem value="system">
                          {t('completionSound.banner.system')}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="orvilo">
                          {t('completionSound.banner.orvilo')}
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  ),
                  desc: settings.systemSoundDisabled
                    ? t('completionSound.banner.systemMuted')
                    : t('completionSound.banner.desc'),
                  label: (
                    <SettingsSearchAnchor id={'notification-banner-sound'}>
                      {t('completionSound.banner.label')}
                    </SettingsSearchAnchor>
                  ),
                },
              ],
              title: t('completionSound.banner.title'),
            },
          ]}
        />
      )}
      <WorkspaceNotification personal />
      {enableBusinessFeatures && <BusinessNotification />}
    </div>
  );
};
