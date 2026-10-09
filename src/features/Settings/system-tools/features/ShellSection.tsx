'use client';

import { type WindowsShellMode } from '@orvilo/electron-client-ipc';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import Form, { type FormGroupItemType } from '@/components/GroupForm';
import { toast } from '@/components/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FORM_STYLE } from '@/const/layoutTokens';
import { runWithRollback } from '@/features/Settings/features/runWithRollback';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { desktopSettingsService } from '@/services/electron/settings';
import { getPlatform } from '@/utils/platform';

/**
 * Windows-only: choose the shell that runs agent commands (automatic
 * PowerShell chain vs Git Bash). Other platforms always use /bin/sh, so the
 * whole section is hidden there.
 */
const ShellSection = memo(() => {
  const { t } = useTranslation('setting');
  const [updating, setUpdating] = useState(false);

  const { data, mutate } = useSWR(
    'desktop-shell-settings',
    desktopSettingsService.getShellSettings,
    { revalidateOnFocus: false },
  );

  const handleChange = useCallback(
    async (mode: WindowsShellMode) => {
      setUpdating(true);
      try {
        await runWithRollback(
          async () => {
            const next = await desktopSettingsService.setShellMode(mode);
            await mutate(next, { revalidate: false });
          },
          // The select is driven by the stored mode, so a failed save needs no
          // local rollback; re-read it in case the main process changed anyway.
          () => void mutate(),
          () => toast.error(t('settingSystemTools.shell.mode.saveFailed')),
        );
      } finally {
        setUpdating(false);
      }
    },
    [mutate, t],
  );

  const options = [
    { label: t('settingSystemTools.shell.mode.auto'), value: 'auto' as const },
    // Only offer Git Bash when Git for Windows is actually installed.
    ...(data?.gitBashAvailable
      ? [{ label: t('settingSystemTools.shell.mode.gitbash'), value: 'gitbash' as const }]
      : []),
  ];

  const shellGroup: FormGroupItemType = {
    children: [
      {
        children: (
          <Select
            disabled={!data || updating}
            items={options}
            value={data?.mode ?? 'auto'}
            onValueChange={(value) => {
              if (value !== null) handleChange(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
        desc: (
          <>
            {t('settingSystemTools.shell.mode.desc')}
            {data && (
              <>
                {' '}
                <code className={'text-muted-foreground'} style={{ fontSize: 12 }}>
                  {data.currentShell.path}
                </code>
              </>
            )}
          </>
        ),
        label: (
          <SettingsSearchAnchor id={'system-tools-shell'}>
            {t('settingSystemTools.shell.mode.title')}
          </SettingsSearchAnchor>
        ),
      },
    ],
    desc: t('settingSystemTools.shell.desc'),
    title: t('settingSystemTools.shell.title'),
  };

  return (
    <Form
      collapsible={false}
      items={[shellGroup]}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
    />
  );
});

const GuardedShellSection = () => {
  if (getPlatform() !== 'Windows') return null;
  return <ShellSection />;
};

export default GuardedShellSection;
