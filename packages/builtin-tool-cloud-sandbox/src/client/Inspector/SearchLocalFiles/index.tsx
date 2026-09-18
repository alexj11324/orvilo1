'use client';

import { createSearchLocalFilesInspector } from '@orvilo/shared-tool-ui/inspectors';

export const SearchLocalFilesInspector = createSearchLocalFilesInspector({
  noResultsKey: 'builtins.orvilo-cloud-sandbox.inspector.noResults',
  translationKey: 'builtins.orvilo-cloud-sandbox.apiName.searchLocalFiles',
});
