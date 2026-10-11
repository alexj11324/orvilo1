'use client';

import { cn } from 'cn';
import { Maximize2Icon, Minimize2Icon, MinusIcon, XIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { getHostPort, hostResultOr } from '@/platform';
import { electronStylish } from '@/styles/electron';

export const WINDOW_CONTROL_WIDTH = 112;

const styles = {
  closeButton:
    'rounded-(--radius-button) text-muted-foreground hover:bg-destructive hover:text-destructive-on-fill',
  container: 'w-28 min-w-28',
  controlButton:
    'rounded-(--radius-button) text-muted-foreground hover:text-foreground hover:bg-accent',
};

const WinControl = memo(() => {
  const { t } = useTranslation('electron');
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncWindowState = async () => {
      const nextState = await getHostPort().window.isMaximized();
      if (mounted) setIsMaximized(hostResultOr(nextState, false));
    };

    void syncWindowState();

    return () => {
      mounted = false;
    };
  }, []);

  const controls = useMemo(
    () => [
      {
        icon: MinusIcon,
        key: 'minimize',
        label: t('window.minimize'),
        onClick: () => void getHostPort().window.minimize(),
      },
      {
        icon: isMaximized ? Minimize2Icon : Maximize2Icon,
        key: 'maximize',
        label: t(isMaximized ? 'window.restore' : 'window.maximize'),
        onClick: async () => {
          await getHostPort().window.maximize();
          setIsMaximized(hostResultOr(await getHostPort().window.isMaximized(), false));
        },
      },
      {
        icon: XIcon,
        key: 'close',
        label: t('window.close'),
        onClick: () => void getHostPort().window.close(),
      },
    ],
    [isMaximized, t],
  );

  return (
    <div
      className={cn(
        cn(styles.container, electronStylish.nodrag),
        'flex items-center gap-1 justify-end',
      )}
    >
      {controls.map((control) => (
        <ActionIcon
          className={control.key === 'close' ? styles.closeButton : styles.controlButton}
          icon={control.icon}
          key={control.key}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
          title={control.label}
          tooltipProps={{ placement: 'bottom' }}
          onClick={control.onClick}
        />
      ))}
    </div>
  );
});

export default WinControl;
