import { Info } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertTitle } from '@/components/ui/alert';

const AbortResponse = memo(() => {
  const { t } = useTranslation('chat');

  return (
    <Alert variant="default">
      <Info />
      <AlertTitle>{t('tool.intervention.toolAbort')}</AlertTitle>
    </Alert>
  );
});

export default AbortResponse;
