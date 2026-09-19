import { type BuiltinRender } from '@orvilo/types';

import PageAction from './PageAction';
import { PageDump } from './PageDump';
import Screenshot from './Screenshot';

/**
 * Retired `orvilo-browser` builtin tool.
 *
 * The execution chain (manifest, executors, server runtime, desktop browser
 * control IPC) was removed in P60. These read-only renders stay registered so
 * persisted conversations containing historical browser calls still display
 * their screenshots and page dumps instead of degrading to plain text.
 */
export const BrowserIdentifier = 'orvilo-browser';

export const BrowserApiName = {
  click: 'click',
  fill: 'fill',
  navigate: 'navigate',
  press: 'press',
  readPage: 'readPage',
  screenshot: 'screenshot',
  scroll: 'scroll',
  snapshot: 'snapshot',
} as const;

export const BrowserRenders: Record<string, BuiltinRender> = {
  [BrowserApiName.click]: PageAction as BuiltinRender,
  [BrowserApiName.fill]: PageAction as BuiltinRender,
  [BrowserApiName.navigate]: PageAction as BuiltinRender,
  [BrowserApiName.press]: PageAction as BuiltinRender,
  [BrowserApiName.readPage]: PageDump as BuiltinRender,
  [BrowserApiName.screenshot]: Screenshot as BuiltinRender,
  [BrowserApiName.scroll]: PageAction as BuiltinRender,
  [BrowserApiName.snapshot]: PageDump as BuiltinRender,
};
