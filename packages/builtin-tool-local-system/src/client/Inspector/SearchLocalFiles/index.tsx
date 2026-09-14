'use client';

import { createSearchLocalFilesInspector } from '@orvilo/shared-tool-ui/inspectors';

export const SearchLocalFilesInspector = createSearchLocalFilesInspector({
  noResultsKey: 'builtins.lobe-local-system.inspector.noResults',
  translationKey: 'builtins.lobe-local-system.apiName.searchLocalFiles',
});
