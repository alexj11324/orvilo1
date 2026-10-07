import i18next from 'i18next';
import { ThemeProvider } from 'next-themes';
import { createRoot } from 'react-dom/client';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { Button } from '@/components/ui/button';

// Import only the selected real host. Importing globals.css here or importing
// both hosts would hide a missing stylesheet in either standalone app graph.
const parameters = new URLSearchParams(location.search);
const appearance = parameters.get('theme') === 'dark' ? 'dark' : 'light';
const { default: StandaloneTheme } =
  parameters.get('host') === 'workbench'
    ? await import('../../apps/workbench/src/shell/WorkbenchTheme')
    : await import('../../apps/share/src/shell/ShareTheme');

await i18next.use(initReactI18next).init({ lng: 'en-US', resources: {} });

createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18next}>
    <ThemeProvider attribute="data-theme" forcedTheme={appearance}>
      <StandaloneTheme>
        <main className="flex flex-col gap-4 p-4" data-testid="standalone-content">
          <Button data-testid="standalone-button">Standalone action</Button>
        </main>
      </StandaloneTheme>
    </ThemeProvider>
  </I18nextProvider>,
);
