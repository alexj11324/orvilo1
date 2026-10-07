import type { ReactSchemaRule } from '@lobehub/editor';

import {
  DESCRIPTION_REFERENCE_SCHEMA,
  parseDescriptionReference,
} from '@/libs/editor/descriptionReference';

import { DescriptionReferenceChip } from './DescriptionReferenceChip';

export const createDescriptionReferenceSchemaRules = (appOrigin: string): ReactSchemaRule[] => [
  {
    id: DESCRIPTION_REFERENCE_SCHEMA,
    match: (url) => parseDescriptionReference(url, appOrigin) !== null,
    parse: (url) => {
      const reference = parseDescriptionReference(url, appOrigin);
      return {
        payload: reference,
        schemaType: DESCRIPTION_REFERENCE_SCHEMA,
        title: reference?.id,
        url: reference?.url,
      };
    },
    render: ({ payload, schemaType, url }) => (
      <DescriptionReferenceChip referenceNode={{ payload, schemaType, url }} />
    ),
  },
];
