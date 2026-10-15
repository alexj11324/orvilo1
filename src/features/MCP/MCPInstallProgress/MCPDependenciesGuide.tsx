import { AlertTriangle, CheckCircle, ExternalLink, Terminal } from 'lucide-react';
import * as m from 'motion/react-m';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { useToolStore } from '@/store/tool';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { type SystemDependencyCheckResult } from '@/types/plugins';

interface MCPDependenciesGuideProps {
  identifier: string;
  systemDependencies: SystemDependencyCheckResult[];
}

const MCPDependenciesGuide = memo<MCPDependenciesGuideProps>(
  ({ identifier, systemDependencies }) => {
    const { t } = useTranslation(['plugin', 'common']);
    const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
    const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
    const motionEnabled = animationMode !== 'disabled' && !prefersReducedMotion;
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
        animate={motionEnabled ? { y: 0 } : { y: [0, 0] }}
        className="mbs-2 w-full max-w-160 rounded-(--radius-card) border border-border bg-card p-4 text-sm leading-5.5"
        initial={motionEnabled ? { y: 8 } : false}
        transition={
          motionEnabled ? { delay: 0.1, duration: 0.2, ease: [0.4, 0, 0.2, 1] } : { duration: 0 }
        }
      >
        <m.div
          animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: [1, 1], y: [0, 0] }}
          className="mbe-2"
          initial={motionEnabled ? { opacity: 0, y: 4 } : false}
          transition={motionEnabled ? { delay: 0.15, duration: 0.2 } : { duration: 0 }}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="shrink-0 text-warning-text" size={16} />
              <h5 className="m-0 text-base leading-6 font-semibold">
                {t('mcpInstall.dependenciesRequired')}
              </h5>
            </div>
            <div className="text-sm leading-5.5 text-muted-foreground">
              {t('mcpInstall.dependenciesDescription')}
            </div>
          </div>
        </m.div>

        <m.div
          animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: [1, 1], y: [0, 0] }}
          initial={motionEnabled ? { opacity: 0, y: 4 } : false}
          transition={motionEnabled ? { delay: 0.2, duration: 0.2 } : { duration: 0 }}
        >
          <div className="flex flex-col gap-2">
            {systemDependencies.map((dep) => (
              <Card
                className="rounded-(--radius-card) border border-divider"
                key={dep.name}
                size="sm"
              >
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 wrap-anywhere text-sm leading-5.5 font-semibold">
                          {dep.name}
                        </span>
                        {dep.requiredVersion && (
                          <span className="text-xs leading-5 text-muted-foreground">
                            {t('mcpInstall.dependencyStatus.requiredVersion', {
                              version: dep.requiredVersion,
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {dep.meetRequirement ? (
                          <>
                            <CheckCircle className="shrink-0 text-success-text" size={14} />
                            <span className="text-xs leading-5 text-success-text">
                              {t('mcpInstall.dependencyStatus.installed')}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="shrink-0 text-warning-text" size={14} />
                            <span className="text-xs leading-5 text-warning-text">
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
                            <span className="text-sm leading-5.5 font-semibold">
                              <Terminal className="me-1 inline-block" size={14} />
                              {t('mcpInstall.installMethods.recommended')}
                            </span>
                            <CodeBlock code={dep.installInstructions.current} language={'bash'} />
                          </div>
                        )}

                        {dep.installInstructions.manual && (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm leading-5.5 font-semibold">
                              <ExternalLink className="me-1 inline-block" size={14} />
                              {t('mcpInstall.installMethods.manual')}
                            </span>
                            <Markdown fontSize={14} lineHeight={22 / 14}>
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
          animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: [1, 1], y: [0, 0] }}
          className="mbs-2 flex justify-end gap-2"
          initial={motionEnabled ? { opacity: 0, y: 4 } : false}
          transition={motionEnabled ? { delay: 0.3, duration: 0.2 } : { duration: 0 }}
        >
          <div className="flex flex-wrap justify-between gap-2">
            <Button size="lg" onClick={handleCancel}>
              {t('common:cancel')}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" variant="outline" onClick={handleSkipCheck}>
                {t('mcpInstall.skipDependencies')}
              </Button>
              <Button size="lg" variant="default" onClick={handleRetryCheck}>
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
