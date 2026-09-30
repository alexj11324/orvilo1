import { Text } from '@lobehub/ui/base-ui';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/ui/code-block';
import { Separator } from '@/components/ui/separator';

import Arguments from '../Arguments';

interface FallbackArgumentRenderProps {
  content: string;
  requestArgs?: string;
  toolCallId: string;
}

export const FallbackArgumentRender = memo<FallbackArgumentRenderProps>(
  ({ toolCallId, content, requestArgs }) => {
    const { t } = useTranslation('plugin');

    // Parse and display result content
    const { data, language } = useMemo(() => {
      try {
        const parsed = JSON.parse(content || '');
        // If parsed result is a string, return it directly
        if (typeof parsed === 'string') {
          return { data: parsed, language: 'plaintext' };
        }
        return { data: JSON.stringify(parsed, null, 2), language: 'json' };
      } catch {
        return { data: content || '', language: 'plaintext' };
      }
    }, [content]);

    // Default render: show arguments and result
    return (
      <div
        className="flex flex-col"
        id={toolCallId}
        style={{
          border: `1px solid ${cssVar.colorBorder}`,
          borderRadius: cssVar.borderRadiusLG,
          width: '100%',
        }}
      >
        <Arguments arguments={requestArgs} />
        {content && (
          <>
            <Separator style={{ marginBlock: 0 }} />
            <div className="flex flex-col px-4" style={{ paddingBlock: '8px 0' }}>
              <Text>{t('debug.response')}</Text>
            </div>
            <CodeBlock
              code={data}
              language={language}
              style={{
                background: 'transparent',
                borderRadius: 0,
                maxHeight: 300,
                overflow: 'auto',
              }}
            />
          </>
        )}
      </div>
    );
  },
);
