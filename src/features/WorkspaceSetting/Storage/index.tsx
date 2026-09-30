'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { HardDriveDownload, HardDriveUpload } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type StorageFormItem,
  useTransferAgentsFormItem,
} from '@/business/client/hooks/useTransferAgentsFormItem';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';

interface StorageFormGroup {
  children: StorageFormItem[];
  title: ReactNode;
}

const StorageGroup = ({ children, title }: StorageFormGroup) => (
  <div>
    <FieldLabel className="mb-2 block">{title}</FieldLabel>
    <FieldGroup className="gap-4">
      {children.map((item) => (
        <Field key={String(item.label)} orientation={'horizontal'}>
          <div className="flex flex-1 flex-col gap-1">
            {item.label && <FieldLabel>{item.label}</FieldLabel>}
            {item.desc && <FieldDescription>{item.desc}</FieldDescription>}
          </div>
          {item.children}
        </Field>
      ))}
    </FieldGroup>
  </div>
);

const WorkspaceStorageContent = memo(() => {
  const { t } = useTranslation('setting');
  const transferAgentsFormItems = useTransferAgentsFormItem();

  const analytics: StorageFormGroup = {
    children: [
      {
        children: <Switch disabled />,
        desc: t('workspaceSetting.storage.telemetry.desc', { appName: BRANDING_NAME }),
        label: t('workspaceSetting.storage.telemetry.title'),
      },
    ],
    title: t('analytics.title'),
  };

  const system: StorageFormGroup = {
    children: [
      {
        children: (
          <Button disabled variant="outline">
            <HardDriveDownload aria-hidden size={16} />
            {t('storage.actions.import.button')}
          </Button>
        ),
        desc: t('workspaceSetting.storage.comingSoon'),
        label: t('storage.actions.import.title'),
      },
      {
        children: (
          <Button disabled variant="outline">
            <HardDriveUpload aria-hidden size={16} />
            {t('storage.actions.export.button')}
          </Button>
        ),
        desc: t('workspaceSetting.storage.comingSoon'),
        label: t('storage.actions.export.title'),
      },
    ],
    title: t('storage.actions.title'),
  };

  const dataMigration: StorageFormGroup | undefined = transferAgentsFormItems
    ? {
        children: transferAgentsFormItems,
        title: t('storage.migration.title'),
      }
    : undefined;

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 1024, width: '100%' }}>
      {[analytics, ...(dataMigration ? [dataMigration] : []), system].map((group) => (
        <StorageGroup children={group.children} key={String(group.title)} title={group.title} />
      ))}
    </div>
  );
});

WorkspaceStorageContent.displayName = 'WorkspaceStorageContent';

export default WorkspaceStorageContent;
