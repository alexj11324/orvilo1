import { Tabs } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderCombine } from '@/components/OrviloIcons';
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/reui/stepper';

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
      <Tabs
        items={[
          {
            children: (
              <Stepper className={styles.steps} orientation={'vertical'} value={1}>
                <StepperNav>
                  {[].map((item, index) => (
                    <StepperItem key={index} step={index + 1}>
                      <StepperTrigger>
                        <StepperIndicator>{index + 1}</StepperIndicator>
                        <div className={'flex flex-col'}>
                          <StepperTitle>{item.title}</StepperTitle>
                          <StepperDescription>{item.description}</StepperDescription>
                        </div>
                      </StepperTrigger>
                      {index < 1 && <StepperSeparator />}
                    </StepperItem>
                  ))}
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
                  {[].map((item, index) => (
                    <StepperItem key={index} step={index + 1}>
                      <StepperTrigger>
                        <StepperIndicator>{index + 1}</StepperIndicator>
                        <div className={'flex flex-col'}>
                          <StepperTitle>{item.title}</StepperTitle>
                          <StepperDescription>{item.description}</StepperDescription>
                        </div>
                      </StepperTrigger>
                      {index < 1 && <StepperSeparator />}
                    </StepperItem>
                  ))}
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
                  {[].map((item, index) => (
                    <StepperItem key={index} step={index + 1}>
                      <StepperTrigger>
                        <StepperIndicator>{index + 1}</StepperIndicator>
                        <div className={'flex flex-col'}>
                          <StepperTitle>{item.title}</StepperTitle>
                          <StepperDescription>{item.description}</StepperDescription>
                        </div>
                      </StepperTrigger>
                      {index < 1 && <StepperSeparator />}
                    </StepperItem>
                  ))}
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
                  {[].map((item, index) => (
                    <StepperItem key={index} step={index + 1}>
                      <StepperTrigger>
                        <StepperIndicator>{index + 1}</StepperIndicator>
                        <div className={'flex flex-col'}>
                          <StepperTitle>{item.title}</StepperTitle>
                          <StepperDescription>{item.description}</StepperDescription>
                        </div>
                      </StepperTrigger>
                      {index < 1 && <StepperSeparator />}
                    </StepperItem>
                  ))}
                </StepperNav>
              </Stepper>
            ),
            key: 'docker',
            label: 'Docker',
          },
        ]}
        style={{
          width: '500px',
        }}
      />
    </>
  );
});

export default SetupGuide;
