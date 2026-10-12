import { createElement } from 'react';

import antdOverride from './antdOverride';
import { flexLayout } from './flexLayout';
import global from './global';

const globalStyleText = [global, flexLayout, antdOverride].join('\n');

/** Mount only for the AppTheme document; importing the barrel does not install CSS. */
export const GlobalStyle = () =>
  createElement('style', { 'data-orvilo-global-style': '' }, globalStyleText);

export { BaseGlobalStyle } from './baseReset';
export { shinyTextStyles } from './loading';
export * from './text';
