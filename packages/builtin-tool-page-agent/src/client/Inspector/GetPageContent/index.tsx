'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { oneLineEllipsis, shinyTextStyles } from '@/styles';

const styles = {
  done: 'text-[var(--ant-color-text-description)]',
};

export const GetPageContentInspector = memo<BuiltinInspectorProps>(({ isArgumentsStreaming }) => {
  const { t } = useTranslation('plugin');

  return (
    <div className={oneLineEllipsis}>
      <span className={cn(isArgumentsStreaming ? shinyTextStyles.shinyText : styles.done)}>
        {t('builtins.orvilo-page-agent.apiName.getPageContent')}
      </span>
    </div>
  );
});

GetPageContentInspector.displayName = 'GetPageContentInspector';

export default GetPageContentInspector;
