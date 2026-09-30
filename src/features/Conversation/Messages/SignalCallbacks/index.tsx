'use client';

import { Markdown } from '@lobehub/ui';
import { Accordion, Text } from '@lobehub/ui/base-ui';
import { type UISignalCallbacksBlock } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { Radio } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const styles = createStaticStyles(({ css }) => ({
  callbackBody: css`
    overflow: auto;
    max-height: 360px;
  `,
  callbackItem: css`
    padding-block: 4px;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  sequence: css`
    flex: none;

    min-width: 20px;

    font-size: 11px;
    font-feature-settings: 'tnum';
    color: ${cssVar.colorTextTertiary};
  `,
}));

const SignalCallbacks = memo<{ block: UISignalCallbacksBlock }>(({ block }) => {
  const { t } = useTranslation('chat');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  return (
    <Accordion
      gap={4}
      indicatorPlacement="inline"
      styles={{ trigger: { paddingBlock: 4, paddingInline: 4 } }}
      value={expandedKeys}
      items={[
        {
          children: (
            <div
              className={cn('flex flex-col p-3', styles.callbackBody)}
              style={{
                border: `1px solid ${cssVar.colorBorder}`,
                borderRadius: cssVar.borderRadiusLG,
                marginBlock: 8,
              }}
            >
              {block.callbacks.length === 0 ? (
                <Text type="secondary">{t('signalCallbacks.empty')}</Text>
              ) : (
                <div className="flex flex-col gap-1">
                  {block.callbacks.map((cb) => (
                    <div className={cn('flex items-start gap-2', styles.callbackItem)} key={cb.id}>
                      {typeof cb.sequence === 'number' && (
                        <span className={styles.sequence}>#{cb.sequence}</span>
                      )}
                      <div className="flex flex-col flex-1">
                        <Markdown variant="chat">{cb.content}</Markdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
          key: 'signal-callbacks',
          title: (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1 justify-center"
                style={{
                  flex: 'none',
                  height: 24,
                  border: `1px solid ${cssVar.colorBorder}`,
                  borderRadius: cssVar.borderRadiusLG,
                  width: 24,
                  fontSize: 12,
                }}
              >
                <Radio color={cssVar.colorTextSecondary} />
              </div>
              <Text as="span" type="secondary">
                {t('signalCallbacks.title', {
                  count: block.callbacks.length,
                  tool: block.sourceToolName,
                })}
              </Text>
            </div>
          ),
        },
      ]}
      onValueChange={setExpandedKeys}
    />
  );
});

SignalCallbacks.displayName = 'SignalCallbacks';

export default SignalCallbacks;
