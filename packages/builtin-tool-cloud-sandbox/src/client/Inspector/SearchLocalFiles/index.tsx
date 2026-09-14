'use client';

import { createSearchLocalFilesInspector } from '@orvilo/shared-tool-ui/inspectors';

export const SearchLocalFilesInspector = createSearchLocalFilesInspector({
  noResultsKey: 'builtins.lobe-cloud-sandbox.inspector.noResults',
  translationKey: 'builtins.lobe-cloud-sandbox.apiName.searchLocalFiles',
});
