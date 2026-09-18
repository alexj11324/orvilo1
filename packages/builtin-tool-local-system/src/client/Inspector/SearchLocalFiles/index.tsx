'use client';

import { createSearchLocalFilesInspector } from '@orvilo/shared-tool-ui/inspectors';

export const SearchLocalFilesInspector = createSearchLocalFilesInspector({
  noResultsKey: 'builtins.orvilo-local-system.inspector.noResults',
  translationKey: 'builtins.orvilo-local-system.apiName.searchLocalFiles',
});
