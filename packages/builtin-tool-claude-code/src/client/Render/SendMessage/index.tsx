'use client';

import { Markdown } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CircleCheckBig, SendHorizontal } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SendMessageArgs, SendMessageResult } from '../../../types';

const parseResult = (content: unknown): SendMessageResult | undefined => {
  if (content && typeof content === 'object') return content as SendMessageResult;
  if (typeof content !== 'string' || !content.trim()) return undefined;
  try {
    return JSON.parse(content) as SendMessageResult;
  } catch {
    return undefined;
  }
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  bodyBox: css`
    overflow: hidden;

    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 8px;

    background: ${cssVar.colorFillTertiary};
  `,
  container: css`
    padding-block: 4px;
  `,
  header: css`
    padding-inline: 4px;
    color: ${cssVar.colorTextSecondary};
  `,
  status: css`
    padding-inline: 4px;
  `,
}));

const SendMessage = memo<BuiltinRenderProps<SendMessageArgs>>(({ args, content }) => {
  const { t } = useTranslation('plugin');

  const body = args?.message ?? args?.content;
  const summary = args?.summary?.trim();

  const result = parseResult(content);
  // The tool's own confirmation embeds the opaque recipient id ("… to <id> at
  // its next tool round"), meaningless to a user — show a localized generic
  // status instead of echoing that raw string.
  const delivered = result?.success === true;

  return (
    <div className={cx('flex flex-col gap-2', styles.container)}>
      <div className={cx('flex flex-row items-center gap-2', styles.header)}>
        <span className="anticon" role="img">
          <SendHorizontal fill={'transparent'} height={'14'} size={'14'} width={'14'} />
        </span>
        <Text ellipsis strong>
          {summary || t('builtins.orvilo-claude-code.sendMessage.title')}
        </Text>
      </div>

      {body && (
        <div className={cx('flex flex-col', styles.bodyBox)}>
          <Markdown style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
            {body}
          </Markdown>
        </div>
      )}

      {delivered && (
        <div className={cx('flex flex-row items-center gap-1.5', styles.status)}>
          <span className="anticon" role="img" style={{ color: cssVar.colorSuccess }}>
            <CircleCheckBig fill={'transparent'} height={'14'} size={'14'} width={'14'} />
          </span>
          <Text style={{ color: cssVar.colorTextSecondary, fontSize: 12 }}>
            {t('builtins.orvilo-claude-code.sendMessage.queued')}
          </Text>
        </div>
      )}
    </div>
  );
});

SendMessage.displayName = 'ClaudeCodeSendMessage';

export default SendMessage;
