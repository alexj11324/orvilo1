import '@/app/globals.css';

import { ThemeProvider } from '@lobehub/ui';
import { createGlobalStyle } from 'antd-style';
import i18next from 'i18next';
import { domAnimation, LazyMotion } from 'motion/react';
import { type FC, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { createModal, ModalHost } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { genFontFamily, genFontFamilyCode } from '@/const/font';
import { TaskAcceptanceHeader } from '@/features/AgentTasks/AgentTaskDetail/TaskAcceptanceHeader';
import { taskDetailLayoutStyles as taskStyles } from '@/features/AgentTasks/AgentTaskDetail/taskDetailLayoutStyles';
import MCPDependenciesGuide from '@/features/MCP/MCPInstallProgress/MCPDependenciesGuide';
import IssueFilterPopover from '@/features/Projects/Issues/IssueFilterPopover';
import type { ProjectIssueFilter } from '@/features/Projects/Issues/issueFilters';
import ApiKeyModalContent from '@/features/Settings/apikey/features/ApiKeyModal/Content';
import genGlobalStyle from '@/styles/global';

import enAuth from '../../locales/en-US/auth.json';
import enChat from '../../locales/en-US/chat.json';
import enCommon from '../../locales/en-US/common.json';
import enPlugin from '../../locales/en-US/plugin.json';
import zhAuth from '../../locales/zh-CN/auth.json';
import zhChat from '../../locales/zh-CN/chat.json';
import zhCommon from '../../locales/zh-CN/common.json';
import zhPlugin from '../../locales/zh-CN/plugin.json';

const NativeGlobalStyle = createGlobalStyle(({ theme }) =>
  genGlobalStyle({ prefixCls: 'ant', token: theme }),
);

const themeModules = import.meta.glob<{ ThemeRoles: FC }>('../../src/styles/themeRoles.ts', {
  eager: true,
});
const ThemeRoles = Object.values(themeModules)[0]?.ThemeRoles ?? (() => null);

const parameters = new URLSearchParams(location.search);
const appearance = parameters.get('theme') === 'dark' ? 'dark' : 'light';
const engineAppearance = parameters.get('engine') === 'light' ? 'light' : appearance;
const language = parameters.get('language') === 'zh' ? 'zh-CN' : 'en-US';
const custom = parameters.get('palette') === 'custom';
const yellow = parameters.get('palette') === 'yellow';
const disabledMotion = parameters.get('motion') === 'disabled';
document.documentElement.lang = language;
document.documentElement.dataset.theme = appearance;
document.documentElement.classList.add('desktop');
document.documentElement.classList.toggle('dark', appearance === 'dark');

await i18next.use(initReactI18next).init({
  lng: language,
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
  resources: {
    'en-US': { auth: enAuth, chat: enChat, common: enCommon, plugin: enPlugin },
    'zh-CN': { auth: zhAuth, chat: zhChat, common: zhCommon, plugin: zhPlugin },
  },
});

function Fixture() {
  const [open, setOpen] = useState(true);
  const [filters, setFilters] = useState<ProjectIssueFilter[]>([]);
  const [milestoneId, setMilestoneId] = useState<string>();
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6 h-dvh overflow-auto">
      <h1>DESIGN runtime acceptance — actual feature subtrees and primitive probes</h1>
      <section data-testid="settings-feature">
        <h2>Settings API key creation content — no API request</h2>
        <Button
          data-testid="open-api-key"
          onClick={() =>
            createModal({
              title:
                language === 'zh-CN'
                  ? '创建 API 密钥 — 长名称与权限说明'
                  : 'Create API key — long name and permission descriptions',
              width: 520,
              content: (
                <ApiKeyModalContent
                  onSubmit={async () => {
                    throw new Error('Fixture blocks API key creation');
                  }}
                />
              ),
            })
          }
        >
          Open API key creation
        </Button>
      </section>
      <section data-testid="project-filter-feature">
        <h2>Projects issue filter — actual feature popover</h2>
        <IssueFilterPopover
          filters={filters}
          milestoneId={milestoneId}
          milestones={[
            {
              id: 'fixture-release',
              name:
                language === 'zh-CN'
                  ? '发布验收与项目里程碑 — 长标签覆盖'
                  : 'Release acceptance and project milestone — long label coverage',
            },
          ]}
          onChange={setFilters}
          onMilestoneChange={setMilestoneId}
          onOpenAdvanced={() => {}}
        />
        <output>{JSON.stringify(filters)}</output>
      </section>
      <section data-testid="task-feature">
        <h2>Task detail acceptance header — actual component with populated count</h2>
        <div className={taskStyles.description} data-testid="retained-task-description">
          Task description layout probe — 项目说明
        </div>
        <div className={taskStyles.propertyValue} data-testid="retained-rail-value">
          Project milestone — 项目里程碑
        </div>
        <TaskAcceptanceHeader count={14} isOpen={open} onToggle={() => setOpen(!open)} />
      </section>
      <section className="flex flex-wrap gap-2" data-testid="badge-probes">
        {(
          [
            'default',
            'secondary',
            'success',
            'warning',
            'destructive',
            'info',
            'outline',
            'success-light',
            'warning-light',
            'info-light',
            'destructive-light',
          ] as const
        ).map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant} —{' '}
            {language === 'zh-CN' ? '等待审核的发布验收' : 'Release acceptance awaiting review'}
          </Badge>
        ))}
      </section>
      <section data-testid="mcp-feature">
        <LazyMotion features={domAnimation}>
          <MCPDependenciesGuide
            identifier="fixture-readonly"
            systemDependencies={[
              {
                name: 'Node.js — local dependency',
                meetRequirement: true,
                installed: true,
                version: '22.23.2',
                requiredVersion: '>= 20',
              },
              {
                name: 'Runtime tool — 待安装依赖',
                meetRequirement: false,
                installed: false,
                requiredVersion: '>= 1',
              },
            ]}
          />
        </LazyMotion>
      </section>
      <section className="flex flex-wrap gap-2" data-testid="primitive-probes">
        {(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const).map(
          (variant) => (
            <Button data-hover-kind={`button-${variant}`} key={variant} variant={variant}>
              {variant}
            </Button>
          ),
        )}
        <Button disabled>Disabled</Button>
        <Spinner data-testid="motion-spinner" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button data-testid="menu-trigger">Menu</Button>} />
          <DropdownMenuContent>
            <DropdownMenuItem>Long local menu action — 项目与任务</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger render={<Button data-testid="tooltip-trigger">Tooltip</Button>} />
          <TooltipContent>Long tooltip — 项目与任务</TooltipContent>
        </Tooltip>
      </section>
      <ModalHost />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18next}>
    <ThemeProvider
      appearance={engineAppearance}
      defaultThemeMode={engineAppearance}
      enableCustomFonts={false}
      customTheme={
        custom || yellow
          ? { primaryColor: yellow ? 'yellow' : 'blue', neutralColor: 'sand' }
          : undefined
      }
      theme={{
        cssVar: { key: 'orvilo-vars' },
        token: {
          motion: !disabledMotion,
          fontFamily: genFontFamily({ locale: language }),
          fontFamilyCode: genFontFamilyCode({ locale: language }),
        },
      }}
    >
      <NativeGlobalStyle />
      <ThemeRoles />
      <TooltipProvider>
        <Fixture />
      </TooltipProvider>
    </ThemeProvider>
  </I18nextProvider>,
);
