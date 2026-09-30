import { Table } from 'antd';
import isEqual from 'fast-deep-equal';
import { Wrench } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { useToolStore } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';

const APIs = memo<{
  id: string;
}>(({ id }) => {
  const { t } = useTranslation('plugin');
  const pluginManifest = useToolStore(pluginSelectors.getToolManifestById(id), isEqual);

  if (!pluginManifest?.api)
    return (
      <Empty style={{ maxWidth: 400 }}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wrench />
          </EmptyMedia>
          <EmptyDescription style={{ fontSize: 14 }}>
            {t('detailModal.info.description')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col py-4" style={{ width: '100%' }}>
      <Table
        bordered
        dataSource={pluginManifest.api}
        pagination={false}
        rowKey={'name'}
        size={'small'}
        tableLayout="fixed"
        columns={[
          {
            dataIndex: 'name',
            render: (name: string) => <code>{name}</code>,
            title: t('detailModal.info.name'),
          },
          {
            dataIndex: 'description',
            title: t('detailModal.info.description'),
          },
        ]}
      />
    </div>
  );
});

export default APIs;
