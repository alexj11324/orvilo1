'use client';

import { createStaticStyles, useTheme } from 'antd-style';
import { cn } from 'cn';
import { TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, buttonVariants } from '@/components/ui/button';
import { MANUAL_UPGRADE_URL } from '@/const/url';
import { CURRENT_VERSION } from '@/const/version';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { useGlobalStore } from '@/store/global';

const styles = createStaticStyles(({ css, cssVar }) => ({
  closeButton: css`
    cursor: pointer;

    position: absolute;
    inset-block-start: 20px;
    inset-inline-end: 20px;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};

    transition: all 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  container: css`
    position: fixed;
    z-index: 9999;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    background: ${cssVar.colorBgMask};
  `,
  content: css`
    position: relative;

    overflow: hidden;

    max-width: 480px;
    padding: 24px;
    border: 1px solid ${cssVar.colorFillQuaternary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  desc: css`
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    font-size: 16px;
    font-weight: bold;
    color: ${cssVar.colorWarningText};
  `,
  titleIcon: css`
    flex-shrink: 0;
    color: ${cssVar.colorWarning};
  `,
  warning: css`
    padding: 12px;
    border-radius: ${cssVar.borderRadius};
    color: ${cssVar.colorWarningText};
    background: var(--warning-yellow-bg, ${cssVar.colorWarningBg});
  `,
}));

const ServerVersionOutdatedAlert = () => {
  const theme = useTheme();
  const { t } = useTranslation('common');
  const [dismissed, setDismissed] = useState(false);
  const isServerVersionOutdated = useGlobalStore((s) => s.isServerVersionOutdated);
  const isOfficialServer = useElectronStore(electronSyncSelectors.isOfficialServer);

  const cssVariables = useMemo<Record<string, string>>(
    () => ({
      '--content-yellow-border': theme.yellowBorder,
      '--warning-yellow-bg': theme.yellowBg,
    }),
    [theme.yellowBorder, theme.yellowBg],
  );

  if (isOfficialServer || !isServerVersionOutdated || dismissed) return null;

  return (
    <div className={styles.container}>
      <div className={styles.content} style={cssVariables}>
        <div className={styles.closeButton} onClick={() => setDismissed(true)}>
          <X />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className={styles.titleIcon} />
            <div className={styles.title}>{t('serverVersionOutdated.title')}</div>
          </div>

          <div className={styles.desc}>
            {t('serverVersionOutdated.desc', { version: CURRENT_VERSION })}
          </div>

          <div className={styles.warning}>{t('serverVersionOutdated.warning')}</div>

          <div className="flex justify-end gap-2" style={{ marginTop: 8 }}>
            <a
              className={cn(buttonVariants({ size: 'sm', variant: 'default' }))}
              href={MANUAL_UPGRADE_URL}
              rel="noreferrer"
              target="_blank"
            >
              {t('serverVersionOutdated.upgrade')}
            </a>
            <Button size="sm" onClick={() => setDismissed(true)}>
              {t('serverVersionOutdated.dismiss')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerVersionOutdatedAlert;
