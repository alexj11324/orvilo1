import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import InlineTable from '@/components/InlineTable';
import { Badge } from '@/components/reui/badge';
import { CodeBlock } from '@/components/ui/code-block';

import { useDetailContext } from '../DetailProvider';
import { SchemaEmpty } from './SchemaList';
import { styles } from './style';
import { ModeType } from './types';

const Resources = memo<{ mode?: ModeType }>(({ mode }) => {
  const { t } = useTranslation(['discover', 'plugin']);
  const { resources } = useDetailContext();

  if (!resources?.length) return <SchemaEmpty>{t('plugin:mcpEmpty.resources')}</SchemaEmpty>;

  return mode === ModeType.Docs ? (
    <div
      className="flex flex-col"
      style={{
        border: `1px solid var(--border)`,
        borderRadius: 'var(--ant-border-radius-lg)',
        overflow: 'hidden',
      }}
    >
      <InlineTable
        dataSource={resources}
        pagination={false}
        size={'middle'}
        columns={[
          {
            dataIndex: 'name',
            key: 'name',
            render: (text) => (
              <span className={styles.code} style={{ color: 'var(--ant-gold)' }}>
                {text}
              </span>
            ),
            title: t('mcp.details.schema.resources.table.name'),
          },
          {
            dataIndex: 'mimeType',
            key: 'mimeType',
            render: (_, record) => (
              <Badge className={styles.code} variant="secondary">
                {record.mimeType}
              </Badge>
            ),
            title: t('mcp.details.schema.resources.table.mineType'),
          },
          {
            dataIndex: 'uri',
            key: 'uri',
            title: t('mcp.details.schema.resources.table.uri'),
          },
          {
            dataIndex: 'description',
            key: 'description',
            title: t('mcp.details.schema.resources.table.description'),
          },
        ]}
      />
    </div>
  ) : (
    <CodeBlock code={JSON.stringify(resources, null, 2)} language="json" style={{ fontSize: 12 }} />
  );
});

export default Resources;
