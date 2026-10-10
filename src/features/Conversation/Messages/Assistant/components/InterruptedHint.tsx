import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const InterruptedHint = memo(() => {
  const { t } = useTranslation('chat');

  return (
    <div className={'py-1 text-xs leading-5 text-muted-foreground'}>
      {t('messageAction.interrupted')} · {t('messageAction.interruptedHint')}
    </div>
  );
});

InterruptedHint.displayName = 'InterruptedHint';

export default InterruptedHint;
