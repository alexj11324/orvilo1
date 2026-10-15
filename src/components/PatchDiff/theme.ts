import { registerCustomTheme, resolveTheme } from '@pierre/diffs';

import { lobeSyntaxTheme } from '@/components/Highlighter/theme';

let registered = false;
export function registerNativeDiffTheme(): void {
  if (registered) return;
  registerCustomTheme('orvilo-diff', async () => ({ ...lobeSyntaxTheme, name: 'orvilo-diff' }));
  resolveTheme('orvilo-diff');
  registered = true;
}

// Same marker roles as the SDK, resolved by the document's actual theme authority.
// Caller unsafeCSS retains its existing full override contract.
export const nativeDiffCSS = `
  :host {
    --diffs-dark-bg: transparent;
    --diffs-light-bg: transparent;
    --diffs-gap-fallback: calc(var(--spacing) * 2);
    --diffs-font-family: var(--lobe-font-family-code);
    --diffs-header-font-family: var(--lobe-font-family);
    --diffs-font-size: var(--text-sm);
    --diffs-line-height: calc(var(--text-sm) * var(--text-sm--line-height));
    --diffs-added-light: var(--orvilo-diff-added-light);
    --diffs-added-dark: var(--orvilo-diff-added-dark);
    --diffs-modified-light: var(--orvilo-diff-modified-light);
    --diffs-modified-dark: var(--orvilo-diff-modified-dark);
    --diffs-deleted-light: var(--orvilo-diff-deleted-light);
    --diffs-deleted-dark: var(--orvilo-diff-deleted-dark);
  }
  [data-gutter-buffer] { opacity: 0.2; }
  [data-code] { padding-top: 0; padding-bottom: 0; }
  [data-gutter] { backdrop-filter: blur(calc(var(--spacing) * 4)); }
`;
