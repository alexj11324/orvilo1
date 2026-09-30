import { type ToolIntervention } from '@orvilo/types';
import {
  BracesIcon,
  CircleAlertIcon,
  FunctionSquareIcon,
  HandIcon,
  MessageSquareCodeIcon,
  SquareArrowDownIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/ui/code-block';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TabItem = {
  children?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  key: string;
  label?: ReactNode;
};

interface DebugProps {
  apiName: string;
  identifier: string;
  intervention?: ToolIntervention;
  requestArgs?: string;
  result?: { content: string | null; error?: any; state?: any };
  toolCallId: string;
  type?: string;
}

const Debug = memo<DebugProps>(
  ({ result, requestArgs, toolCallId, apiName, identifier, type, intervention }) => {
    const { t } = useTranslation('plugin');

    const params = useMemo(() => {
      try {
        return JSON.stringify(JSON.parse(requestArgs || ''), null, 2);
      } catch {
        return '';
      }
    }, [requestArgs]);

    const functionCall = useMemo(() => {
      return {
        apiName,
        arguments: requestArgs,
        id: toolCallId,
        identifier,
        type,
      };
    }, [requestArgs, toolCallId, apiName, identifier, type]);

    const isJsonResult =
      result?.content?.trim().startsWith('{') || result?.content?.trim().startsWith('[');

    const items: TabItem[] = useMemo(
      () => [
        {
          children: (
            <CodeBlock
              code={params}
              language="json"
              style={{ background: 'transparent', borderRadius: 0, height: '100%' }}
            />
          ),
          icon: <MessageSquareCodeIcon />,
          key: 'arguments',
          label: t('debug.arguments'),
        },
        {
          children: (
            <CodeBlock
              code={isJsonResult ? JSON.stringify(result?.content, null, 2) : result?.content || ''}
              language={isJsonResult ? 'json' : 'plaintext'}
              style={{ background: 'transparent', borderRadius: 0, height: '100%' }}
            />
          ),
          icon: <SquareArrowDownIcon />,
          key: 'response',
          label: t('debug.response'),
        },
        {
          children: (
            <CodeBlock
              code={JSON.stringify(functionCall, null, 2)}
              language="json"
              style={{ background: 'transparent', borderRadius: 0, height: '100%' }}
            />
          ),
          icon: <FunctionSquareIcon />,
          key: 'function_call',
          label: t('debug.function_call'),
        },
        {
          children: (
            <CodeBlock
              code={JSON.stringify(result?.state, null, 2)}
              language="json"
              style={{ background: 'transparent', borderRadius: 0, height: '100%' }}
            />
          ),
          icon: <BracesIcon />,
          key: 'pluginState',
          label: t('debug.pluginState'),
        },
        {
          children: (
            <CodeBlock
              code={JSON.stringify(intervention, null, 2)}
              language="json"
              style={{ background: 'transparent', borderRadius: 0, height: '100%' }}
            />
          ),
          icon: <HandIcon />,
          key: 'intervention',
          label: t('debug.intervention'),
        },
        ...(result?.error
          ? [
              {
                children: (
                  <CodeBlock
                    code={JSON.stringify(result.error, null, 2)}
                    language="json"
                    style={{ background: 'transparent', borderRadius: 0, height: '100%' }}
                  />
                ),
                icon: <CircleAlertIcon />,
                key: 'error',
                label: t('debug.error'),
              },
            ]
          : []),
      ],
      [
        functionCall,
        isJsonResult,
        params,
        result?.content,
        result?.error,
        result?.state,
        intervention,
        t,
      ],
    );

    return (
      <div
        className="flex flex-col"
        style={{
          border: `1px solid ${cssVar.colorBorder}`,
          borderRadius: cssVar.borderRadiusLG,
          overflow: 'hidden',
        }}
      >
        <Tabs orientation={'vertical'}>
          <TabsList
            style={{
              borderRadius: 0,
            }}
          >
            {items.map((item) => (
              <TabsTrigger
                disabled={item.disabled}
                key={item.key}
                value={item.key}
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'start',
                }}
              >
                {item.icon}
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {(items as { children?: ReactNode; key: string }[]).map(
            (item) =>
              item.children != null && (
                <TabsContent
                  key={item.key}
                  value={item.key}
                  style={{
                    flex: 'auto',
                    height: 300,
                    minHeight: 0,
                    minWidth: 0,
                    padding: 0,
                  }}
                >
                  {item.children}
                </TabsContent>
              ),
          )}
        </Tabs>
      </div>
    );
  },
);

export default Debug;
