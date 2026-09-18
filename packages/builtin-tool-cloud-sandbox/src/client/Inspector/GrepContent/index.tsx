'use client';

import { createGrepContentInspector } from '@orvilo/shared-tool-ui/inspectors';

export const GrepContentInspector = createGrepContentInspector({
  noResultsKey: 'builtins.orvilo-cloud-sandbox.inspector.noResults',
  translationKey: 'builtins.orvilo-cloud-sandbox.apiName.grepContent',
});
