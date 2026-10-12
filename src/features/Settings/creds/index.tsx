'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';
import { usePermission } from '@/hooks/usePermission';

import { createCreateCredModal } from './features/CreateCredModal';
import CredsList from './features/CredsList';
import { useCredsApi } from './features/useCredsApi';

interface PageProps {
  mobile?: boolean;
}

const Page = ({ mobile }: PageProps) => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials, reason } = usePermission('manage_provider_key');
  const [refreshKey, setRefreshKey] = useState(0);
  const credsApi = useCredsApi();

  const handleCreate = () => {
    if (!canManageCredentials) return;
    createCreateCredModal({
      credsApi,
      onSuccess: () => setRefreshKey((k) => k + 1),
    });
  };

  const createButton = (
    <span title={reason}>
      <Button
        disabled={!canManageCredentials}
        size={mobile ? 'lg' : 'sm'}
        type="button"
        variant="default"
        onClick={handleCreate}
      >
        <Plus className="shrink-0" />
        {t('creds.create')}
      </Button>
    </span>
  );

  if (mobile) {
    return (
      <>
        <div className="flex justify-end p-4">{createButton}</div>
        <CredsList key={refreshKey} />
      </>
    );
  }

  return (
    <>
      <NavHeader right={createButton} styles={{ center: { alignItems: 'center' } }}>
        <span>{t('tab.creds')}</span>
      </NavHeader>
      <SettingContainer paddingBlock={'24px 128px'} paddingInline={24} width="wide">
        <CredsList key={refreshKey} />
      </SettingContainer>
    </>
  );
};

Page.displayName = 'CredsSetting';

export default Page;
