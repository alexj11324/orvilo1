'use client';

import { useTranslation } from 'react-i18next';

import { ProductLogo } from '@/components/Branding';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/utils/clipboard';

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
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-be border-solid border-divider bg-card px-3 text-foreground">
      <div className="flex min-w-0 flex-1 items-center">
        <a className="flex text-inherit" href={'/'}>
          <ProductLogo size={28} />
        </a>
      </div>
      <div className="flex min-w-0 flex-2 flex-col">
        <div className="m-0 min-w-0 truncate text-center text-sm font-semibold">{title}</div>
      </div>
      <div className="flex items-center flex-1 gap-2 justify-end">
        <Button size={'normal'} variant={'outline'} onClick={handleShare}>
          {t('sharePage.artifact.share')}
        </Button>
        <Button nativeButton={false} render={<a href={'/'} />} role={'link'} size={'normal'}>
          {t('sharePage.menu.goToOrvilo')}
        </Button>
      </div>
    </div>
  );
};
