import {
  closeContextMenu as closeWebContextMenu,
  setContextMenuInterceptor,
  showContextMenu as showWebContextMenu,
} from '@lobehub/ui';
import { isHostUnsupportedResult } from '@orvilo/types';
import debug from 'debug';

import { getHostPort } from '@/platform';

import { canGoNative } from './canGoNative';
import { isDarwinDesktop } from './platform';
import { toNativeTemplate } from './toNativeTemplate';
import type { NativeContextMenuItem, ShowContextMenuOptions } from './types';

const log = debug('orvilo-client:context-menu');

let popupToken = 0;
let activeMenu: 'native' | 'web' | null = null;

const runNativePopup = (
  template: ReturnType<typeof toNativeTemplate>['template'],
  handlers: Map<string, () => void>,
) => {
  const token = ++popupToken;
  activeMenu = 'native';

  log('opening native context menu with %d item(s)', template.length);

  getHostPort()
    .menu.popupContextMenu({ items: template })
    .then((result) => {
      if (token !== popupToken) return;
      activeMenu = null;
      if (isHostUnsupportedResult(result)) return;
      const handler = result.clickedId ? handlers.get(result.clickedId) : undefined;
      handlers.clear();
      handler?.();
    })
    .catch((error) => {
      if (token !== popupToken) return;
      activeMenu = null;
      handlers.clear();
      log('popupContextMenu failed: %O', error);
    });
};

const routeShow = (
  items: NativeContextMenuItem[],
  options: ShowContextMenuOptions | undefined,
  showWeb: () => void,
) => {
  if (!isDarwinDesktop() || !canGoNative(items, options)) {
    activeMenu = 'web';
    showWeb();
    return;
  }

  const { template, handlers } = toNativeTemplate(items);

  if (template.length === 0) {
    activeMenu = 'web';
    showWeb();
    return;
  }

  runNativePopup(template, handlers);
};

const routeClose = (closeWeb: () => void) => {
  if (activeMenu === 'native') {
    activeMenu = null;
    void getHostPort().menu.closePopupContextMenu();
    return;
  }

  closeWeb();
};

export const showContextMenu = (
  items: NativeContextMenuItem[],
  options?: ShowContextMenuOptions,
): void => {
  routeShow(items, options, () => showWebContextMenu(items, options));
};

export const closeContextMenu = (): void => {
  routeClose(closeWebContextMenu);
};

export const registerNativeContextMenuInterceptor = (): void => {
  setContextMenuInterceptor({
    close: routeClose,
    show: routeShow,
  });
};

export { routeShow as showContextMenuWithFallback };
