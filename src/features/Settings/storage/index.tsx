'use client';

import { FormGroup } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import { ArticleSkeleton } from '@/components/Skeleton';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import { useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import Advanced from './features/Advanced';

interface PageProps {
  showSettingHeader?: boolean;
}

const Page = ({ showSettingHeader = true }: PageProps) => {
  const { t } = useTranslation('setting');
  const serverConfigInit = useServerConfigStore((s) => s.serverConfigInit);
  const isUserLoaded = useUserStore(authSelectors.isLoaded);

  const isLoading = !serverConfigInit || !isUserLoaded;

  return (
    <>
      {showSettingHeader && <SettingHeader title={t('tab.storage')} />}
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'column', display: isLoading ? 'flex' : 'none' }}
      >
        <FormGroup collapsible={false} title={t('storage.actions.title')} variant="filled">
          <ArticleSkeleton rows={4} />
        </FormGroup>
      </div>
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'column', display: isLoading ? 'none' : 'flex' }}
      >
        <Advanced />
      </div>
    </>
  );
};

export default Page;
