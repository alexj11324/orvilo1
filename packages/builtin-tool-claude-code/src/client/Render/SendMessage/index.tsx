'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
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

const styles = {
  bodyBox: 'overflow-hidden rounded-(--radius-card) bg-muted px-2 py-1',
  container: 'py-1 text-sm leading-5.5',
  header: 'px-1 text-muted-foreground',
  status: 'px-1',
};

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
    <div className={cn('flex flex-col gap-2', styles.container)}>
      <div className={cn('flex flex-row items-center gap-2', styles.header)}>
        <span className="anticon" role="img">
          <SendHorizontal fill={'transparent'} height={'14'} size={'14'} width={'14'} />
        </span>
        <div className="truncate block font-semibold">
          {summary || t('builtins.orvilo-claude-code.sendMessage.title')}
        </div>
      </div>

      {body && (
        <div className={cn('flex flex-col', styles.bodyBox)}>
          <Markdown style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
            {body}
          </Markdown>
        </div>
      )}

      {delivered && (
        <div className={cn('flex flex-row items-center gap-1.5', styles.status)}>
          <span className="anticon text-success-text" role="img">
            <CircleCheckBig fill={'transparent'} height={'14'} size={'14'} width={'14'} />
          </span>
          <div className="text-xs leading-5 text-muted-foreground">
            {t('builtins.orvilo-claude-code.sendMessage.queued')}
          </div>
        </div>
      )}
    </div>
  );
});

SendMessage.displayName = 'ClaudeCodeSendMessage';

export default SendMessage;
