import { Markdown } from '@lobehub/ui';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import InlineTable from '@/components/InlineTable';
import { CodeBlock } from '@/components/reui/code-block/code-block';
import { markdownToTxt } from '@/utils/markdownToTxt';

import { useDetailContext } from '../DetailProvider';
import { SchemaEmpty, SchemaItem, SchemaList, SchemaSubtitle } from './SchemaList';
import { styles } from './style';
import { ModeType } from './types';

interface PromptsProps {
  activeKey?: string[];
  mode?: ModeType;
  setActiveKey?: (key: string[]) => void;
}

const Prompts = memo<PromptsProps>(({ mode, activeKey = [], setActiveKey }) => {
  const { t } = useTranslation(['discover', 'plugin']);
  const { prompts } = useDetailContext();

  if (!prompts?.length) return <SchemaEmpty>{t('plugin:mcpEmpty.prompts')}</SchemaEmpty>;

  return (
    <SchemaList activeKey={activeKey} setActiveKey={setActiveKey}>
      {prompts.map((item) => (
        <SchemaItem
          desc={item.description ? markdownToTxt(item.description) : undefined}
          id={`prompts-${item.name}`}
          key={item.name}
          meta={t('mcp.details.schema.prompts.argsCount', { count: item.arguments?.length ?? 0 })}
          name={item.name}
          open={activeKey.includes(item.name)}
        >
          {item.description && <Markdown fontSize={14}>{item.description}</Markdown>}
          <div className="flex flex-col gap-1.5">
            <SchemaSubtitle>{t('mcp.details.schema.prompts.arguments')}</SchemaSubtitle>
            {mode === ModeType.Docs ? (
              <InlineTable
                dataSource={item.arguments}
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
                    title: t('mcp.details.schema.prompts.table.name'),
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
                    title: t('mcp.details.schema.prompts.table.required'),
                  },
                  {
                    dataIndex: 'description',
                    title: t('mcp.details.schema.prompts.table.description'),
                  },
                ]}
              />
            ) : (
              <CodeBlock
                code={JSON.stringify(item.arguments, null, 2)}
                language={'json'}
                style={{ fontSize: 12 }}
                variant={'ghost'}
              />
            )}
          </div>
        </SchemaItem>
      ))}
    </SchemaList>
  );
});

export default Prompts;
