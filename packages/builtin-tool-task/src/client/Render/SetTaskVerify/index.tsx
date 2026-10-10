'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { Check, ShieldCheck, X } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SetTaskVerifyParams, SetTaskVerifyState } from '../../../types';
import { TaskResultCard } from '../shared';

const styles = {
  offBadge:
    'inline-flex shrink-0 items-center gap-1 rounded-[999px] bg-accent px-2 py-0.5 text-[12px] text-[var(--ant-color-text-tertiary)]',
  onBadge:
    'inline-flex shrink-0 items-center gap-1 rounded-[999px] bg-[var(--ant-color-success-bg)] px-2 py-0.5 text-[12px] text-success',
};

export const SetTaskVerifyRender = memo<
  BuiltinRenderProps<SetTaskVerifyParams, SetTaskVerifyState>
>(({ args, pluginState }) => {
  const { t } = useTranslation('plugin');

  const params = args ?? ({} as Partial<SetTaskVerifyParams>);
  const identifier = pluginState?.identifier ?? params.identifier;
  const enabled = pluginState?.enabled ?? params.enabled;
  const requirement = params.requirement;
  const showStatus = enabled === true || enabled === false;

  // The on/off state lives in the header; the body is just the acceptance
  // requirement rendered as markdown.
  const statusBadge = showStatus ? (
    <span className={enabled ? styles.onBadge : styles.offBadge}>
      {createElement(enabled ? Check : X, { size: 13 })}
      {t(enabled ? 'builtins.orvilo-task.verify.on' : 'builtins.orvilo-task.verify.off')}
    </span>
  ) : undefined;

  return (
    <TaskResultCard
      headerExtra={statusBadge}
      icon={ShieldCheck}
      iconColor={enabled === false ? 'var(--ant-color-text-tertiary)' : 'var(--success)'}
      identifier={identifier}
      title={t('builtins.orvilo-task.apiName.setTaskVerify')}
    >
      {requirement ? (
        <Markdown fontSize={12} variant={'chat'}>
          {requirement}
        </Markdown>
      ) : null}
    </TaskResultCard>
  );
});

SetTaskVerifyRender.displayName = 'SetTaskVerifyRender';

export default SetTaskVerifyRender;
