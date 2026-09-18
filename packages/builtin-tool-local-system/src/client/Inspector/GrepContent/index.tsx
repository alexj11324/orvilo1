'use client';

import { createGrepContentInspector } from '@orvilo/shared-tool-ui/inspectors';

export const GrepContentInspector = createGrepContentInspector({
  noResultsKey: 'builtins.orvilo-local-system.inspector.noResults',
  translationKey: 'builtins.orvilo-local-system.apiName.grepContent',
});
