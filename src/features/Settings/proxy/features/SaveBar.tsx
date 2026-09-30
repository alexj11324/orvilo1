'use client';

import { createStaticStyles } from 'antd-style';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    pointer-events: none;

    position: fixed;
    z-index: 1000;
    inset-block-end: 24px;
    inset-inline-start: 50%;
    transform: translateX(-50%);
  `,
  pill: css`
    pointer-events: auto;

    display: inline-flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 16px 6px;
    border: 1px solid color-mix(in srgb, ${cssVar.colorBorderSecondary} 60%, transparent);
    border-radius: 999px;

    font-size: 13px;
    color: ${cssVar.colorText};

    background: color-mix(in srgb, ${cssVar.colorBgElevated} 85%, transparent);
    backdrop-filter: blur(16px) saturate(1.2);
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  dot: css`
    flex-shrink: 0;

    width: 6px;
    height: 6px;
    border-radius: 50%;

    background: ${cssVar.colorWarning};
  `,
  message: css`
    color: ${cssVar.colorTextSecondary};
  `,
}));

interface SaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
}

const SaveBar = memo<SaveBarProps>(({ isDirty, isSaving, onReset, onSave }) => {
  const { t } = useTranslation('electron');

  return (
    <AnimatePresence>
      {isDirty && (
        <m.div
          animate={{ opacity: 1, y: 0 }}
          aria-live="polite"
          className={styles.container}
          exit={{ opacity: 0, y: 16 }}
          initial={{ opacity: 0, y: 16 }}
          role="status"
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <div className={styles.pill}>
            <span className={styles.dot} />
            <span className={styles.message}>{t('proxy.unsavedChanges')}</span>
            <Button disabled={isSaving} size="sm" variant="ghost" onClick={onReset}>
              {t('proxy.resetButton')}
            </Button>
            <Button
              aria-busy={isSaving}
              disabled={isSaving}
              size="sm"
              variant="default"
              onClick={onSave}
            >
              {isSaving && <Spinner />}
              {t('proxy.saveButton')}
            </Button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
});

SaveBar.displayName = 'SaveBar';

export default SaveBar;
