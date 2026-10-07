import '@/app/globals.css';

import { ThemeProvider } from '@lobehub/ui';
import { PlusIcon } from 'lucide-react';
import { createRoot } from 'react-dom/client';

import ActionIcon, { type ActionIconSize } from '@/components/ActionIcon';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import ActionIconWithChevron from '@/features/ResourceManager/components/Explorer/ToolBar/ActionIconWithChevron';

import { HoverFixture } from './hoverFixture';

const parameters = new URLSearchParams(location.search);
const language = parameters.get('language') === 'zh' ? 'zh' : 'en';
const longText = parameters.get('text') === 'long';
const appearance = parameters.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
document.documentElement.classList.toggle('dark', parameters.get('theme') === 'dark');
const title = language === 'zh' ? '项目与任务' : 'Projects and tasks';
const label = longText ? `${title} — ${title} — ${title} — ${title}` : title;
const sizes: { id: string; size: ActionIconSize }[] = [
  { id: 'small', size: 'small' },
  { id: 'middle', size: 'middle' },
  { id: 'large', size: 'large' },
  { id: 'numeric', size: 18 },
  { id: 'custom', size: { blockSize: 30, size: 18 } },
  { id: 'css-size', size: { blockSize: '2.5rem', size: '1.25rem' } },
];

createRoot(document.getElementById('root')!).render(
  <ThemeProvider
    appearance={appearance}
    defaultThemeMode={appearance}
    enableCustomFonts={false}
    theme={{ cssVar: { key: 'orvilo-vars' } }}
  >
    <TooltipProvider>
      <main style={{ display: 'grid', gap: 24, margin: '0 auto', maxWidth: 760, padding: 24 }}>
        <h1 style={{ fontSize: 18 }}>UI alignment regression fixture</h1>
        <HoverFixture />
        <section aria-label="Primary button foreground">
          <Button data-testid="primary-button">
            {language === 'zh' ? '连接设备' : 'Connect device'}
          </Button>
          <span data-testid="primary-foreground" style={{ color: 'var(--primary-foreground)' }}>
            {title}
          </span>
        </section>
        <section
          aria-label="Action icon sizes"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}
        >
          {sizes.map(({ id, size }) => (
            <div key={id} style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <span>{id}</span>
              <ActionIcon
                data-testid={`action-${id}`}
                icon={PlusIcon}
                size={size}
                title={`${title}: ${id}`}
              />
              <ActionIcon
                loading
                aria-label={`Loading ${id}`}
                data-testid={`loading-${id}`}
                icon={PlusIcon}
                size={size}
              />
            </div>
          ))}
          <ActionIcon
            aria-label="Custom glyph style"
            data-testid="icon-style"
            icon={PlusIcon}
            size="small"
            styles={{ icon: { height: 12, width: 12 } }}
          />
          <ActionIcon
            aria-label="Outlined action"
            data-testid="outlined"
            icon={PlusIcon}
            size="small"
            variant="outlined"
          />
          <ActionIcon
            aria-label="Filled action"
            data-testid="filled"
            icon={PlusIcon}
            size="small"
            variant="filled"
          />
        </section>
        <section aria-label="Plain span wrapper diagnostic">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span data-testid="project-label" style={{ lineHeight: '24px' }}>
              {title}
            </span>
            <span data-testid="project-action-wrapper">
              <ActionIcon
                aria-label="Project action"
                data-testid="project-action"
                icon={PlusIcon}
                size="small"
              />
            </span>
          </div>
        </section>
        <section aria-label="Aligned project action wrapper">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span data-testid="aligned-project-label" style={{ lineHeight: '24px' }}>
              {label}
            </span>
            <span className="inline-flex" data-testid="aligned-project-wrapper">
              <ActionIcon
                aria-label="Aligned project action"
                data-testid="aligned-project-action"
                icon={PlusIcon}
                size="small"
              />
            </span>
          </div>
        </section>
        <section aria-label="Resource toolbar">
          <ActionIconWithChevron
            aria-label="Resource actions"
            data-testid="resource-action"
            icon={PlusIcon}
          />
        </section>
        <Accordion>
          <AccordionItem value="details">
            <div data-testid="header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AccordionTrigger data-testid="accordion-trigger">
                  <span data-testid="accordion-label" style={{ lineHeight: '24px' }}>
                    {label}
                  </span>
                </AccordionTrigger>
              </div>
              <ActionIcon data-testid="header-action" icon={PlusIcon} size="small" title={title} />
            </div>
            <AccordionContent>Content remains reachable after expanding.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>
    </TooltipProvider>
  </ThemeProvider>,
);
