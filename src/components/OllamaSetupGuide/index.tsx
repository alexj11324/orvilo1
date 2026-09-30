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
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  CodeBlockTitle,
} from '@/components/ui/code-block';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const styles = createStaticStyles(({ css }) => ({
  steps: css`
    margin-block-start: 32px;
  `,
}));

const SetupGuide = memo(() => {
  const { t } = useTranslation('components');
  return (
    <>
      <ProviderCombine provider={'ollama'} size={30} style={{ marginBottom: -8, marginLeft: 4 }} />
      <Tabs defaultValue={'macos'} style={{ width: '500px' }}>
        <TabsList>
          <TabsTrigger value={'macos'}>macOS</TabsTrigger>
          <TabsTrigger value={'windows'}>{t('OllamaSetupGuide.install.windowsTab')}</TabsTrigger>
          <TabsTrigger value={'linux'}>Linux</TabsTrigger>
          <TabsTrigger value={'docker'}>Docker</TabsTrigger>
        </TabsList>
        <TabsContent value="macos">
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
                          <CodeBlock
                            wrap
                            code={'launchctl setenv OLLAMA_ORIGINS "*"'}
                            language={'bash'}
                          >
                            <CodeBlockCopyButton />
                          </CodeBlock>
                          {t('OllamaSetupGuide.cors.reboot')}
                        </div>
                      </div>
                    </StepperDescription>
                  </div>
                </div>
              </StepperItem>
            </StepperNav>
          </Stepper>
        </TabsContent>
        <TabsContent value="windows">
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
        </TabsContent>
        <TabsContent value="linux">
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
                        <CodeBlock
                          wrap
                          code={'curl -fsSL https://ollama.com/install.sh | sh'}
                          language={'bash'}
                        >
                          <CodeBlockCopyButton />
                        </CodeBlock>
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
                        <CodeBlock
                          wrap
                          code={'sudo systemctl edit ollama.service'}
                          language={'bash'}
                        >
                          <CodeBlockCopyButton />
                        </CodeBlock>
                        {t('OllamaSetupGuide.cors.linux.env')}
                        <CodeBlock
                          code={'[Service]\n\nEnvironment="OLLAMA_ORIGINS=*"'}
                          language={'bash'}
                        >
                          <CodeBlockHeader>
                            <CodeBlockTitle>{'ollama.service'}</CodeBlockTitle>
                            <CodeBlockLanguage />
                            <CodeBlockCopyButton />
                          </CodeBlockHeader>
                        </CodeBlock>
                        {t('OllamaSetupGuide.cors.linux.reboot')}
                      </div>
                    </StepperDescription>
                  </div>
                </div>
              </StepperItem>
            </StepperNav>
          </Stepper>
        </TabsContent>
        <TabsContent value="docker">
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
                        <CodeBlock wrap code={'docker pull ollama/ollama'} language={'bash'}>
                          <CodeBlockCopyButton />
                        </CodeBlock>
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
                        <CodeBlock
                          wrap
                          language={'bash'}
                          code={
                            'docker run -d --gpus=all -v ollama:/root/.ollama -e OLLAMA_ORIGINS="*" -p 11434:11434 --name ollama ollama/ollama'
                          }
                        >
                          <CodeBlockHeader>
                            <CodeBlockTitle>{'ollama.service'}</CodeBlockTitle>
                            <CodeBlockLanguage />
                            <CodeBlockCopyButton />
                          </CodeBlockHeader>
                        </CodeBlock>
                      </div>
                    </StepperDescription>
                  </div>
                </div>
              </StepperItem>
            </StepperNav>
          </Stepper>
        </TabsContent>
      </Tabs>
    </>
  );
});

export default SetupGuide;
