import isEqual from 'fast-deep-equal';
import { Wrench } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import LiteTable from '@/components/LiteTable';
import SimpleEmpty from '@/components/SimpleEmpty';
import { useToolStore } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';

const APIs = memo<{
  id: string;
}>(({ id }) => {
  const { t } = useTranslation('plugin');
  const pluginManifest = useToolStore(pluginSelectors.getToolManifestById(id), isEqual);

  if (!pluginManifest?.api)
    return (
      <SimpleEmpty
        description={t('detailModal.info.description')}
        descriptionProps={{ fontSize: 14 }}
        icon={Wrench}
        style={{ maxWidth: 400 }}
      />
    );

  return (
    <div className="flex flex-col py-4 w-[100%]">
      <LiteTable
        dataSource={pluginManifest.api}
        rowKey={(api) => api.name}
        columns={[
          {
            key: 'name',
            render: (api) => <code>{api.name}</code>,
            title: t('detailModal.info.name'),
          },
          {
            key: 'description',
            render: (api) => api.description,
            title: t('detailModal.info.description'),
          },
        ]}
      />
    </div>
  );
});

export default APIs;
