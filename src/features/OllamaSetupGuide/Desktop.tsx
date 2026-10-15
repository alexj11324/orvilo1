import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Ollama } from '@/components/BrandIcons';
import FormAction from '@/components/FormAction';

const OllamaDesktopSetupGuide = memo(() => {
  const { t } = useTranslation('components');

  return (
    <div className="flex w-full max-w-75 flex-col items-center justify-center gap-4 py-8">
      <FormAction
        avatar={<Ollama color={'var(--ant-color-primary)'} size={64} />}
        title={t('OllamaSetupGuide.install.title')}
        description={
          <span>
            <Trans
              i18nKey={'OllamaSetupGuide.install.description'}
              ns={'components'}
              components={[
                <span key="0" />,
                <a href={'https://ollama.com/download'} key="1" rel="noreferrer" target="_blank" />,
              ]}
            />
          </span>
        }
      />
    </div>
  );
});

export default OllamaDesktopSetupGuide;
