'use client';

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import ResourceAccessPage from '@/features/ResourcePermission/ResourceAccessPage';

const DocumentPermission = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('setting');
  if (!id) return null;

  return (
    <ResourceAccessPage
      copy={{
        generalAccessDesc: t('permission.page.documentGeneralAccessDesc'),
        privateHint: t('permission.page.documentAccessLevelPrivateHint'),
        privateNotice: t('permission.page.documentPrivateNotice'),
      }}
      redirectPath="/resource/documents"
      resourceHomePath={`/resource?file=${encodeURIComponent(id)}`}
      resourceId={id}
      resourceType="document"
      showCollaborators
    />
  );
};

export default DocumentPermission;
