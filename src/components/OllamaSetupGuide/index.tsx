import { Highlighter, Snippet } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ProviderCombine } from '@/components/OrviloIcons';
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
} from '@/components/reui/stepper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const styles = createStaticStyles(({ css }) => ({
  steps: css`
    margin-block-start: 32px;
  `,
}));

const SetupGuide = memo(() => {
  const { t } = useTranslation('components');

  const items = [
    {
      children: (
        <Stepper className={styles.steps} orientation={'vertical'} value={1}>
          <StepperNav>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{1}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.install.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <Trans
                      i18nKey={'OllamaSetupGuide.install.description'}
                      ns={'components'}
                      components={[
                        <span key="0" />,
                        <a
                          href={'https://ollama.com/download'}
                          key="1"
                          rel="noreferrer"
                          target="_blank"
                        />,
                      ]}
                    />
                  </StepperDescription>
                </div>
              </div>
              <StepperSeparator />
            </StepperItem>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{2}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.cors.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <div className="flex flex-col gap-2">
                      {t('OllamaSetupGuide.cors.description')}

                      <div className="flex flex-col gap-2">
                        {t('OllamaSetupGuide.cors.macos')}
                        <Snippet language={'bash'}>
                          {}
                          launchctl setenv OLLAMA_ORIGINS "*"
                        </Snippet>
                        {t('OllamaSetupGuide.cors.reboot')}
                      </div>
                    </div>
                  </StepperDescription>
                </div>
              </div>
            </StepperItem>
          </StepperNav>
        </Stepper>
      ),
      key: 'macos',
      label: 'macOS',
    },
    {
      children: (
        <Stepper className={styles.steps} orientation={'vertical'} value={1}>
          <StepperNav>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{1}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.install.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <Trans
                      i18nKey={'OllamaSetupGuide.install.description'}
                      ns={'components'}
                      components={[
                        <span key="0" />,
                        <a
                          href={'https://ollama.com/download'}
                          key="1"
                          rel="noreferrer"
                          target="_blank"
                        />,
                      ]}
                    />
                  </StepperDescription>
                </div>
              </div>
              <StepperSeparator />
            </StepperItem>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{2}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.cors.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <div className="flex flex-col gap-2">
                      {t('OllamaSetupGuide.cors.description')}
                      <div>{t('OllamaSetupGuide.cors.windows')}</div>
                      <div>{t('OllamaSetupGuide.cors.reboot')}</div>
                    </div>
                  </StepperDescription>
                </div>
              </div>
            </StepperItem>
          </StepperNav>
        </Stepper>
      ),
      key: 'windows',
      label: t('OllamaSetupGuide.install.windowsTab'),
    },
    {
      children: (
        <Stepper className={styles.steps} orientation={'vertical'} value={1}>
          <StepperNav>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{1}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.install.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <div className="flex flex-col gap-2">
                      {t('OllamaSetupGuide.install.linux.command')}
                      <Snippet language={'bash'}>
                        curl -fsSL https://ollama.com/install.sh | sh
                      </Snippet>
                      <div>
                        <Trans
                          i18nKey={'OllamaSetupGuide.install.linux.manual'}
                          ns={'components'}
                          components={[
                            <span key="0" />,
                            <a
                              href={'https://github.com/ollama/ollama/blob/main/docs/linux.md'}
                              key="1"
                              rel="noreferrer"
                              target="_blank"
                            />,
                          ]}
                        />
                      </div>
                    </div>
                  </StepperDescription>
                </div>
              </div>
              <StepperSeparator />
            </StepperItem>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{2}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.cors.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <div className="flex flex-col gap-2">
                      <div>{t('OllamaSetupGuide.cors.description')}</div>

                      <div>{t('OllamaSetupGuide.cors.linux.systemd')}</div>
                      {}
                      <Snippet language={'bash'}> sudo systemctl edit ollama.service</Snippet>
                      {t('OllamaSetupGuide.cors.linux.env')}
                      <Highlighter
                        fullFeatured
                        showLanguage
                        fileName={'ollama.service'}
                        language={'bash'}
                        children={`[Service]

Environment="OLLAMA_ORIGINS=*"`}
                      />
                      {t('OllamaSetupGuide.cors.linux.reboot')}
                    </div>
                  </StepperDescription>
                </div>
              </div>
            </StepperItem>
          </StepperNav>
        </Stepper>
      ),
      key: 'linux',
      label: 'Linux',
    },
    {
      children: (
        <Stepper className={styles.steps} orientation={'vertical'} value={1}>
          <StepperNav>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{1}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.install.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <div className="flex flex-col gap-2">
                      {t('OllamaSetupGuide.install.description')}
                      <div>{t('OllamaSetupGuide.install.docker')}</div>
                      <Snippet language={'bash'}>docker pull ollama/ollama</Snippet>
                    </div>
                  </StepperDescription>
                </div>
              </div>
              <StepperSeparator />
            </StepperItem>
            <StepperItem step={1}>
              <div className="flex items-start gap-2">
                <StepperIndicator>{2}</StepperIndicator>
                <div className={'flex flex-col'}>
                  <StepperTitle className="mb-4 text-base font-bold">
                    {t('OllamaSetupGuide.cors.title')}
                  </StepperTitle>
                  <StepperDescription className="mb-6">
                    <div className="flex flex-col gap-2">
                      {t('OllamaSetupGuide.cors.description')}
                      <Highlighter
                        fullFeatured
                        showLanguage
                        fileName={'ollama.service'}
                        language={'bash'}
                      >
                        {}
                        docker run -d --gpus=all -v ollama:/root/.ollama -e OLLAMA_ORIGINS="*" -p
                        11434:11434 --name ollama ollama/ollama
                      </Highlighter>
                    </div>
                  </StepperDescription>
                </div>
              </div>
            </StepperItem>
          </StepperNav>
        </Stepper>
      ),
      key: 'docker',
      label: 'Docker',
    },
  ];
  return (
    <>
      <ProviderCombine provider={'ollama'} size={30} style={{ marginBottom: -8, marginLeft: 4 }} />
      <Tabs>
        <TabsList>
          {items.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {items.map((item) => (
          <TabsContent key={item.key} value={item.key}>
            {item.children}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
});

export default SetupGuide;
