import { Markdown } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { AlertTriangle, CheckCircle, ExternalLink, Terminal } from 'lucide-react';
import * as m from 'motion/react-m';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { useToolStore } from '@/store/tool';
import { type SystemDependencyCheckResult } from '@/types/plugins';

interface MCPDependenciesGuideProps {
  identifier: string;
  systemDependencies: SystemDependencyCheckResult[];
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  commandBlock: css`
    position: relative;

    padding-block: ${cssVar.paddingXS};
    padding-inline: ${cssVar.paddingSM};
    border: 1px solid ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadiusSM};

    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM};

    background-color: ${cssVar.colorFillTertiary};

    &:hover {
      background-color: ${cssVar.colorFillSecondary};
    }
  `,
  container: css`
    margin-block-start: ${cssVar.marginXS};
    padding: ${cssVar.padding};
    border: 1px solid ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadius};

    background-color: ${cssVar.colorBgContainer};
  `,
  copyButton: css`
    position: absolute;
    inset-block-start: ${cssVar.paddingXXS};
    inset-inline-end: ${cssVar.paddingXXS};

    height: auto;
    min-height: auto;
    padding-block: 2px;
    padding-inline: 6px;

    font-size: 12px;
  `,
  dependencyCard: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusSM};
  `,
  footer: css`
    display: flex;
    gap: ${cssVar.marginXS};
    justify-content: flex-end;
    margin-block-start: ${cssVar.marginXS};
  `,
  statusIcon: css`
    display: flex;
    gap: ${cssVar.marginXXS};
    align-items: center;
  `,
}));

const MCPDependenciesGuide = memo<MCPDependenciesGuideProps>(
  ({ identifier, systemDependencies }) => {
    const { t } = useTranslation(['plugin', 'common']);
    const [installMCPPlugin, cancelInstallMCPPlugin] = useToolStore((s) => [
      s.installMCPPlugin,
      s.cancelInstallMCPPlugin,
    ]);

    const handleCancel = () => {
      cancelInstallMCPPlugin(identifier);
    };

    const handleRetryCheck = async () => {
      // Re-check dependencies, restart the installation process
      await installMCPPlugin(identifier);
    };

    const handleSkipCheck = async () => {
      // Skip dependency check, continue installation process
      await installMCPPlugin(identifier, { skipDepsCheck: true });
    };

    return (
      <m.div
        animate={{ y: 0 }}
        className={styles.container}
        initial={{ y: 8 }}
        transition={{ delay: 0.1, duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <m.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 4 }}
          style={{ marginBottom: 8 }}
          transition={{ delay: 0.15, duration: 0.2 }}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle color={cssVar.colorWarning} size={16} />
              <h5 className="m-0">{t('mcpInstall.dependenciesRequired')}</h5>
            </div>
            <div className="text-[12px] text-muted-foreground">
              {t('mcpInstall.dependenciesDescription')}
            </div>
          </div>
        </m.div>

        <m.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 4 }}
          transition={{ delay: 0.2, duration: 0.2 }}
        >
          <div className="flex flex-col gap-2">
            {systemDependencies.map((dep) => (
              <Card className={styles.dependencyCard} key={dep.name} size="sm">
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{dep.name}</span>
                        {dep.requiredVersion && (
                          <span className="text-[12px] text-muted-foreground">
                            {t('mcpInstall.dependencyStatus.requiredVersion', {
                              version: dep.requiredVersion,
                            })}
                          </span>
                        )}
                      </div>
                      <div className={styles.statusIcon}>
                        {dep.meetRequirement ? (
                          <>
                            <CheckCircle color={cssVar.colorSuccess} size={14} />
                            <span className="text-[12px] text-success">
                              {t('mcpInstall.dependencyStatus.installed')}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle color={cssVar.colorWarning} size={14} />
                            <span className="text-[12px] text-warning">
                              {t('mcpInstall.dependencyStatus.notInstalled')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {!dep.meetRequirement && dep.installInstructions && (
                      <div className="flex flex-col gap-3">
                        {dep.installInstructions.current && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-semibold">
                              <Terminal size={12} style={{ marginRight: 4 }} />
                              {t('mcpInstall.installMethods.recommended')}
                            </span>
                            <CodeBlock code={dep.installInstructions.current} language={'bash'} />
                          </div>
                        )}

                        {dep.installInstructions.manual && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-semibold">
                              <ExternalLink size={12} style={{ marginRight: 4 }} />
                              {t('mcpInstall.installMethods.manual')}
                            </span>
                            <Markdown style={{ fontSize: 12 }}>
                              {dep.installInstructions.manual}
                            </Markdown>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </m.div>

        <m.div
          animate={{ opacity: 1, y: 0 }}
          className={styles.footer}
          initial={{ opacity: 0, y: 4 }}
          transition={{ delay: 0.3, duration: 0.2 }}
        >
          <div className="flex justify-between">
            <Button size="sm" onClick={handleCancel}>
              {t('common:cancel')}
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleSkipCheck}>
                {t('mcpInstall.skipDependencies')}
              </Button>
              <Button size="sm" variant="default" onClick={handleRetryCheck}>
                {t('mcpInstall.recheckDependencies')}
              </Button>
            </div>
          </div>
        </m.div>
      </m.div>
    );
  },
);

export default MCPDependenciesGuide;
