'use client';

import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import { ProductLogo } from '@/components/Branding';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/utils/clipboard';

const styles = createStaticStyles(({ css, cssVar }) => ({
  header: css`
    flex-shrink: 0;

    height: 48px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  logo: css`
    display: flex;
    color: inherit;
  `,
  title: css`
    min-width: 0;
  `,
}));

interface ArtifactShareChromeProps {
  title?: string | null;
}

export const ArtifactShareChrome = ({ title }: ArtifactShareChromeProps) => {
  const { t } = useTranslation('chat');

  const handleShare = async () => {
    await copyToClipboard(window.location.href);
    toast.success(t('shareModal.copyLinkSuccess'));
  };

  return (
    <div className={cn('flex items-center gap-3 justify-between', styles.header)}>
      <div className="flex items-center flex-1" style={{ minWidth: 0 }}>
        <a className={styles.logo} href={'/'}>
          <ProductLogo size={28} />
        </a>
      </div>
      <div className="flex flex-col" style={{ flex: 2, minWidth: 0 }}>
        <div
          className={cn('truncate min-w-0 font-semibold text-center text-[14px]', styles.title)}
          style={{ margin: 0 }}
        >
          {title}
        </div>
      </div>
      <div className="flex items-center flex-1 gap-2 justify-end">
        <Button size={'small'} onClick={handleShare}>
          {t('sharePage.artifact.share')}
        </Button>
        <Button href={'/'} size={'small'} type={'primary'}>
          {t('sharePage.menu.goToOrvilo')}
        </Button>
      </div>
    </div>
  );
};
