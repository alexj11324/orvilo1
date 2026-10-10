import { SiApple, SiLinux } from '@icons-pack/react-simple-icons';
import { Microsoft } from '@lobehub/icons';
import { startCase } from 'es-toolkit/compat';
import {
  CheckIcon,
  CloudIcon,
  CodeIcon,
  DownloadIcon,
  MinusIcon,
  Package,
  TerminalIcon,
} from 'lucide-react';
import { createElement, memo, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Descriptions from '@/components/Descriptions';
import InlineTable from '@/components/InlineTable';
import { Badge } from '@/components/reui/badge';
import { CodeBlock } from '@/components/reui/code-block/code-block';
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/reui/stepper';
import SimpleEmpty from '@/components/SimpleEmpty';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { markdownToTxt } from '@/utils/markdownToTxt';

import InstallationIcon from '../../../components/MCPDepsIcon';
import CollapseDesc from '../CollapseDesc';
import CollapseLayout from '../CollapseLayout';
import { useDetailContext } from '../DetailProvider';
import Title from '../Title';
import Platform from './Platform';

const styles = {
  code: 'font-mono',
};

interface InstallInstructionsDep {
  checkCommand?: string;
  installInstructions?: Record<string, string>;
}

const InstallInstructionsHover = memo<{
  dep: InstallInstructionsDep;
  getPlatformIcon: (type: string) => ReactNode;
}>(({ dep, getPlatformIcon }) => {
  const { t } = useTranslation('discover');
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const scheduleOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <span onMouseEnter={scheduleOpen} onMouseLeave={scheduleClose}>
            <ActionIcon
              aria-label={t('download', { ns: 'common' })}
              color={'var(--ant-color-text-description)'}
              icon={DownloadIcon}
              size={'small'}
            />
          </span>
        }
      />
      <PopoverContent
        className="w-auto p-3"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        <div className="flex flex-col gap-2">
          <Descriptions
            rows={1}
            items={Object.entries(dep.installInstructions || {}).map(([system, code]) => ({
              copyable: true,
              icon: getPlatformIcon(system),
              key: system,
              label: <span style={{ fontSize: 13, fontWeight: 500 }}>{system.toUpperCase()}</span>,
              style: {
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              },
              value: code,
            }))}
          />
          {dep.checkCommand && (
            <>
              <Separator />
              <Descriptions
                rows={1}
                items={[
                  {
                    copyable: true,
                    key: 'check',
                    label: t('mcp.details.deployment.checkCommand'),
                    style: {
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                    },
                    value: dep.checkCommand,
                  },
                ]}
              />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
InstallInstructionsHover.displayName = 'InstallInstructionsHover';

const Deployment = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation(['discover', 'plugin']);
  const { deploymentOptions = [], identifier } = useDetailContext();
  const [activeKey, setActiveKey] = useState<string[]>(['0']);

  if (!deploymentOptions)
    return (
      <div className="rounded-md border bg-card">
        <SimpleEmpty
          description={t('plugin:mcpEmpty.deployment')}
          descriptionProps={{ fontSize: 14 }}
          icon={Package}
          style={{ maxWidth: 400 }}
        />
      </div>
    );

  const getConnectionTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'stdio': {
        return (
          <span className="anticon" role="img">
            <TerminalIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
        );
      }
      default: {
        return (
          <span className="anticon" role="img">
            <CloudIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
        );
      }
    }
  };

  const getPlatformIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'macos': {
        return <SiApple color={'var(--ant-color-text-description)'} size={16} />;
      }
      case 'windows': {
        return <Microsoft color={'var(--ant-color-text-description)'} size={16} />;
      }
      case 'linux_debian': {
        return <SiLinux color={'var(--ant-color-text-description)'} size={16} />;
      }
      case 'manual': {
        return <CodeIcon color={'var(--ant-color-text-description)'} size={16} />;
      }
      default: {
        return <CodeIcon color={'var(--ant-color-text-description)'} size={16} />;
      }
    }
  };

  return (
    <Accordion
      multiple
      className="flex flex-col gap-6"
      value={activeKey}
      onValueChange={setActiveKey}
    >
      {deploymentOptions.map((item, index) => {
        let properties: {
          description?: string;
          name: string;
          required?: boolean;
          type: string;
        }[] = [];
        if (item.connection?.configSchema?.properties) {
          properties = Object.entries(item.connection.configSchema.properties).map(
            ([key, value]: any) => {
              const required = item.connection.configSchema?.required?.includes(key);
              return {
                name: key,
                required,
                ...value,
              };
            },
          );
        }
        const setupSteps = item?.installationDetails?.setupSteps || [];
        const installCommand = [item.connection.command, item.connection.args?.join(' ')].join(' ');
        const showSystemDependencies =
          item?.systemDependencies && item.systemDependencies.length > 0;
        const title = (
          <div className="flex flex-col">
            <Title
              icon={<InstallationIcon size={20} type={item.installationMethod} />}
              id={`deployment-${index}`}
              tag={
                <>
                  <Badge variant="secondary">
                    {getConnectionTypeIcon(item.connection.type)}
                    {item.connection.type}
                  </Badge>
                  {item.isRecommended && (
                    <Badge variant="success">{t('mcp.details.deployment.recommended')}</Badge>
                  )}
                </>
              }
            >
              {t('mcp.details.deployment.installation', {
                method: startCase(item.installationMethod),
              })}
            </Title>
            {
              <CollapseDesc hide={activeKey.includes(String(index))}>
                {item.description && markdownToTxt(item.description)}
              </CollapseDesc>
            }
          </div>
        );
        const content = (
          <CollapseLayout
            items={[
              {
                children: (
                  <Platform connection={item.connection} identifier={identifier} mobile={mobile} />
                ),
                key: 'platform',
              },
              {
                children: (
                  <>
                    <p style={{ margin: 0 }}>{item.description}</p>
                    {setupSteps && setupSteps.length > 0 && (
                      <Stepper defaultValue={0} orientation={'vertical'} style={{ marginTop: 12 }}>
                        <StepperNav>
                          {setupSteps.map((i, index) => (
                            <StepperItem key={index} step={index + 1}>
                              <StepperTrigger>
                                <StepperIndicator />
                                <StepperTitle>
                                  <p style={{ color: 'var(--foreground)', margin: 0 }}>{i}</p>
                                </StepperTitle>
                              </StepperTrigger>
                              {index < setupSteps.length - 1 && <StepperSeparator />}
                            </StepperItem>
                          ))}
                        </StepperNav>
                      </Stepper>
                    )}
                    {item.connection.command && (
                      <CodeBlock code={`$ ${installCommand}`} language={'shell'} />
                    )}
                  </>
                ),
                key: 'guide',
                title: t('mcp.details.deployment.guide'),
              },
              item.connection.configSchema && {
                children: (
                  <InlineTable
                    dataSource={properties}
                    pagination={false}
                    rowKey={'name'}
                    columns={[
                      {
                        dataIndex: 'name',
                        render: (_, record) => (
                          <span
                            className={styles.code}
                            style={{
                              color: 'var(--ant-gold)',
                            }}
                          >
                            {record.name}
                          </span>
                        ),
                        title: t('mcp.details.deployment.table.name'),
                      },
                      {
                        dataIndex: 'type',
                        render: (_, record) => (
                          <Badge className={styles.code} variant="secondary">
                            {record.type}
                          </Badge>
                        ),
                        title: t('mcp.details.deployment.table.type'),
                      },
                      {
                        dataIndex: 'required',
                        render: (_, record) => (
                          <span className="anticon" role="img">
                            {createElement(record.required ? CheckIcon : MinusIcon, {
                              size: '1em',
                              width: '1em',
                              height: '1em',
                              color: record.required
                                ? 'var(--success)'
                                : 'var(--ant-color-text-description)',
                              fill: 'transparent',
                            })}
                          </span>
                        ),
                        title: t('mcp.details.deployment.table.required'),
                      },
                      {
                        dataIndex: 'description',
                        title: t('mcp.details.deployment.table.description'),
                      },
                    ]}
                  />
                ),
                key: 'env',
                title: t('mcp.details.deployment.env'),
              },
              showSystemDependencies && {
                children: (
                  <Descriptions
                    bordered
                    items={(item.systemDependencies || []).map((dep, i) => {
                      return {
                        icon: <InstallationIcon size={16} type={dep.name} />,
                        key: `system-dependency-${i}`,
                        label: dep.name,
                        value: (
                          <div className="flex flex-row items-center gap-2">
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 12,
                              }}
                            >
                              {dep.requiredVersion || 'installed'}
                            </span>
                            {dep.installInstructions && (
                              <InstallInstructionsHover
                                dep={dep}
                                getPlatformIcon={getPlatformIcon}
                              />
                            )}
                          </div>
                        ),
                      };
                    })}
                  />
                ),
                key: 'commandLine',
                title: t('mcp.details.deployment.commandLine'),
              },
            ].filter(Boolean)}
          />
        );
        return (
          <AccordionItem className="rounded-md border" key={String(index)} value={String(index)}>
            <AccordionTrigger className="px-4">{title}</AccordionTrigger>
            <AccordionContent className="p-[12px_16px]">{content}</AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
});

export default Deployment;
