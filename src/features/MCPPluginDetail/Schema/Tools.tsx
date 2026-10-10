import { Markdown } from '@lobehub/ui';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import InlineTable from '@/components/InlineTable';
import { Badge } from '@/components/reui/badge';
import { CodeBlock } from '@/components/reui/code-block/code-block';
import { markdownToTxt } from '@/utils/markdownToTxt';

import { useDetailContext } from '../DetailProvider';
import { SchemaEmpty, SchemaItem, SchemaList, SchemaSubtitle } from './SchemaList';
import { styles } from './style';
import { ModeType } from './types';

interface ToolsProps {
  activeKey?: string[];
  mode?: ModeType;
  setActiveKey?: (key: string[]) => void;
}

const Tools = memo<ToolsProps>(({ mode, activeKey = [], setActiveKey }) => {
  const { t } = useTranslation(['discover', 'plugin']);
  const { tools } = useDetailContext();

  if (!tools?.length) return <SchemaEmpty>{t('plugin:mcpEmpty.tools')}</SchemaEmpty>;

  return (
    <SchemaList activeKey={activeKey} setActiveKey={setActiveKey}>
      {tools.map((item) => {
        let properties: {
          description?: string;
          name: string;
          required?: boolean;
          type: string;
        }[] = [];
        if (item.inputSchema?.properties) {
          properties = Object.entries(item.inputSchema.properties).map(([key, value]: any) => {
            const required = item.inputSchema?.required?.includes(key);
            return {
              name: key,
              required,
              ...value,
            };
          });
        }
        return (
          <SchemaItem
            desc={item.description ? markdownToTxt(item.description) : undefined}
            id={`tools-${item.name}`}
            key={item.name}
            meta={t('mcp.details.schema.tools.paramsCount', { count: properties.length })}
            name={item.name}
            open={activeKey.includes(item.name)}
          >
            {item.description && <Markdown fontSize={14}>{item.description}</Markdown>}
            <div className="flex flex-col gap-1.5">
              <SchemaSubtitle>{t('mcp.details.schema.tools.inputSchema')}</SchemaSubtitle>
              {mode === ModeType.Docs ? (
                <InlineTable
                  dataSource={properties}
                  pagination={false}
                  rowKey={'name'}
                  columns={[
                    {
                      dataIndex: 'name',
                      render: (_, record) => (
                        <span className={styles.code} style={{ color: 'var(--ant-gold)' }}>
                          {record.name}
                        </span>
                      ),
                      title: t('mcp.details.schema.tools.table.name'),
                    },
                    {
                      dataIndex: 'type',
                      render: (_, record) => (
                        <Badge className={styles.code} variant="secondary">
                          {record.type}
                        </Badge>
                      ),
                      title: t('mcp.details.schema.tools.table.type'),
                    },
                    {
                      dataIndex: 'required',
                      render: (_, record) => (
                        <span className="anticon" role="img">
                          {createElement(record.required ? CheckIcon : MinusIcon, {
                            size: '1em',
                            width: '1em',
                            height: '1em',
                            color: record.required
                              ? 'var(--success)'
                              : 'var(--ant-color-text-description)',
                            fill: 'transparent',
                          })}
                        </span>
                      ),
                      title: t('mcp.details.schema.tools.table.required'),
                    },
                    {
                      dataIndex: 'description',
                      title: t('mcp.details.schema.tools.table.description'),
                    },
                  ]}
                />
              ) : (
                <CodeBlock
                  code={JSON.stringify(item.inputSchema, null, 2)}
                  language={'json'}
                  style={{ fontSize: 12 }}
                  variant={'ghost'}
                />
              )}
            </div>
          </SchemaItem>
        );
      })}
    </SchemaList>
  );
});

export default Tools;
