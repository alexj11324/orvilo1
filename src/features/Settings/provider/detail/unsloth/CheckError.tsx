import { BASE_PROVIDER_DOC_URL } from '@orvilo/const';
import { useTranslation } from 'react-i18next';

import type { CheckErrorRender } from '../../features/ProviderConfig/Checker';

export const CheckError: CheckErrorRender = ({ defaultError, error }) => {
  const { t } = useTranslation('modelProvider');

  if (!error) return defaultError;

  return (
    <div className="flex flex-col gap-2">
      {defaultError}
      <span className="text-sm text-muted-foreground">{t('unsloth.checker.guidance')}</span>
      <a href={`${BASE_PROVIDER_DOC_URL}/unsloth`} rel={'noreferrer'} target={'_blank'}>
        {t('unsloth.checker.setupGuide')}
      </a>
    </div>
  );
};
