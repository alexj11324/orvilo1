import { featureFlags, serverConfig } from './fixtures';
import { installPreviewTransport } from './transport';

declare const __ORVILO_UI_PREVIEW__: boolean;
if (!__ORVILO_UI_PREVIEW__)
  throw new Error('Preview fixtures cannot initialize outside the isolated preview build.');
window.__SERVER_CONFIG__ = {
  analyticsConfig: {},
  clientEnv: {},
  config: serverConfig,
  featureFlags,
  isMobile: false,
};
installPreviewTransport();
// This is the shipped Web application — no alternate router, shell, page, or store.
void import('../entry.web');
