'use client';

import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const HUD_DURATION_MS = 1500;

const styles = {
  caption: 'mt-0.5 text-xs leading-5 font-medium text-foreground-tertiary uppercase',
  hud: 'pointer-events-none flex flex-col gap-1 items-center justify-center w-36 h-27 border border-divider rounded-(--radius-overlay) bg-popover [backdrop-filter:blur(28px)_saturate(1.6)] shadow-(--shadow-popover)',
  layer: 'pointer-events-none fixed z-1500 [inset-block-start:28%] inset-x-0 flex justify-center',
  num: 'text-3xl leading-9 font-semibold tabular-nums text-foreground',
};

const ZoomHUD = memo(() => {
  const { t } = useTranslation('common');
  const [factor, setFactor] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useWatchBroadcast('zoom:changed', ({ factor: next }) => {
    setFactor(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFactor(null), HUD_DURATION_MS);
  });

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <AnimatePresence>
      {factor !== null && (
        <div className={styles.layer}>
          <m.div
            animate={{ opacity: 1, scale: 1 }}
            aria-live="polite"
            className={styles.hud}
            exit={{ opacity: 0, scale: 0.96 }}
            initial={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className={styles.num}>{Math.round(factor * 100)}%</span>
            <span className={styles.caption}>{t('zoom')}</span>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
});

ZoomHUD.displayName = 'ZoomHUD';

export default ZoomHUD;
