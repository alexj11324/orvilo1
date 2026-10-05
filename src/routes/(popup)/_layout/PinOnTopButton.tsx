'use client';

import { isHostUnsupportedResult } from '@orvilo/types';
import { PinIcon, PinOffIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { getHostPort, hostResultOr } from '@/platform';
import { electronStylish } from '@/styles/electron';

const PinOnTopButton = memo(() => {
  const { t } = useTranslation('electron');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getHostPort()
      .window.isAlwaysOnTop()
      .then((value) => {
        if (mounted) setPinned(hostResultOr(value, false));
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = async () => {
    const next = !pinned;
    const result = await getHostPort().window.setAlwaysOnTop(next);
    if (!isHostUnsupportedResult(result)) setPinned(next);
  };

  return (
    <ActionIcon
      active={pinned}
      className={electronStylish.nodrag}
      icon={pinned ? PinIcon : PinOffIcon}
      size={{ blockSize: 28, size: 14 }}
      tooltipProps={{ placement: 'bottom' }}
      title={t(pinned ? 'window.unpinFromTop' : 'window.pinToTop', {
        defaultValue: pinned ? 'Unpin from top' : 'Pin on top',
      })}
      onClick={toggle}
    />
  );
});

PinOnTopButton.displayName = 'PinOnTopButton';

export default PinOnTopButton;
