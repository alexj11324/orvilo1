import './fixture.css';

import { DEFAULT_SETTINGS } from '@orvilo/config';
import { domMax, LazyMotion } from 'motion/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';

import { useWorkspaceContextStore } from '@/business/client/workspaceContextStore';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingSheet } from '@/components/FloatingSheet';
import { Image, PreviewGroup } from '@/components/ImagePreview';
import { ModalHost } from '@/components/Modal';
import { toast, ToastHost } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import AppTheme from '@/layout/GlobalProvider/AppTheme';
import NextThemeProvider from '@/layout/GlobalProvider/NextThemeProvider';
import QueryProvider from '@/layout/GlobalProvider/Query';
import Locale from '@/layout/SPAGlobalProvider/Locale';
import { ServerConfigStoreProvider } from '@/store/serverConfig/Provider';
import { useUserStore } from '@/store/user';

const records: Array<{ kind: string; value?: unknown; context: string }> = [];
const record = (kind: string, value?: unknown) =>
  records.push({
    kind,
    value,
    context: `${document.documentElement.dataset.theme}-${window.innerWidth}`,
  });
const image =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#4287f5"/><text x="30" y="240" font-size="40" fill="white">Native image 640×480</text></svg>',
  );
useWorkspaceContextStore.getState().setActiveWorkspace(null);
useUserStore.setState({
  isUserStateInit: true,
  isSignedIn: true,
  isLoaded: true,
  user: { id: 'sdk942-synthetic', username: 'Native fixture 用户' } as any,
  defaultSettings: structuredClone(DEFAULT_SETTINGS),
  settings: { general: { animationMode: 'agile' } },
});
function Scene() {
  const { setTheme, resolvedTheme } = useTheme();
  const [scene, setScene] = useState('image');
  const [panel, setPanel] = useState(false);
  const [sheet, setSheet] = useState(true);
  const [point, setPoint] = useState(320);
  useEffect(() => {
    (window as any).sdk942 = { records, scene, resolvedTheme };
  }, [scene, resolvedTheme]);
  return (
    <main
      className="h-full min-h-screen w-full bg-background p-4 text-foreground"
      data-sdk-scene={scene}
    >
      <nav className="flex flex-wrap gap-2">
        {['image', 'panel', 'sheet'].map((name) => (
          <Button data-scene={name} key={name} onClick={() => setScene(name)}>
            {name}
          </Button>
        ))}
        <Button data-theme-button="light" onClick={() => setTheme('light')}>
          Light
        </Button>
        <Button data-theme-button="dark" onClick={() => setTheme('dark')}>
          Dark
        </Button>
        <Button
          data-motion="disabled"
          onClick={() =>
            useUserStore.setState((state) => ({
              settings: {
                ...state.settings,
                general: { ...state.settings.general, animationMode: 'disabled' },
              },
            }))
          }
        >
          Disable motion
        </Button>
        <Button
          data-motion="agile"
          onClick={() =>
            useUserStore.setState((state) => ({
              settings: {
                ...state.settings,
                general: { ...state.settings.general, animationMode: 'agile' },
              },
            }))
          }
        >
          Enable motion
        </Button>
      </nav>
      {scene === 'image' && (
        <section data-image-owner className="mt-4">
          <PreviewGroup preview={{ onOpenChange: (value) => record('image-open', value) }}>
            <Image alt="Native test image" height={180} src={image} width={240} />
            <Image alt="Native second image" height={90} src={image} width={120} />
          </PreviewGroup>
        </section>
      )}
      {scene === 'panel' && (
        <>
          <Button data-open-panel onClick={() => setPanel(true)}>
            Open panel
          </Button>
          <FloatingPanel
            afterClose={() => record('panel-after-close')}
            ariaLabel="Native review panel"
            getContainer={false}
            height={480}
            minHeight={320}
            minWidth={280}
            open={panel}
            title="Native review panel"
            width={360}
            onResize={(value) => record('panel-resize', value)}
            onResizeEnd={(value) => record('panel-resize-end', value)}
            onClose={() => {
              record('panel-close');
              setPanel(false);
            }}
          >
            <input
              aria-label="Panel draft"
              className="m-3 border border-border"
              defaultValue="Draft retained"
            />
            <Button data-panel-toast onClick={() => toast.success('Native panel toast')}>
              Show toast
            </Button>
          </FloatingPanel>
        </>
      )}
      {scene === 'sheet' && (
        <section data-sheet-parent className="relative mt-4 h-160">
          <FloatingSheet
            activeSnapPoint={point}
            maxHeight={600}
            minHeight={320}
            open={sheet}
            snapPoints={[320, 600]}
            title="Native conversation sheet"
            onOpenChange={(value) => {
              record('sheet-open', value);
              setSheet(value);
            }}
            onSnapPointChange={(value) => {
              record('sheet-snap', value);
              setPoint(value);
            }}
          >
            <input aria-label="Sheet draft" defaultValue="Sheet state retained" />
          </FloatingSheet>
          <Button data-open-sheet onClick={() => setSheet(true)}>
            Reopen sheet
          </Button>
        </section>
      )}
    </main>
  );
}
function App() {
  return (
    <MemoryRouter>
      <NextThemeProvider>
        <Locale defaultLang="en-US">
          <AppTheme>
            <ServerConfigStoreProvider
              isMobile={false}
              serverConfig={{ aiProvider: {}, telemetry: {}, enableBusinessFeatures: true }}
            >
              <QueryProvider>
                <LazyMotion features={domMax}>
                  <TooltipProvider>
                    <Scene />
                    <ModalHost />
                    <ToastHost />
                  </TooltipProvider>
                </LazyMotion>
              </QueryProvider>
            </ServerConfigStoreProvider>
          </AppTheme>
        </Locale>
      </NextThemeProvider>
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
