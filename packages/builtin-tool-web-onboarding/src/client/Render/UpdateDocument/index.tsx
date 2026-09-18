'use client';

import { Flexbox } from '@lobehub/ui';
import type { MarkdownPatchHunk } from '@orvilo/markdown-patch';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { UpdateDocumentArgs, WebOnboardingDocumentType } from '../../../types';
import HunkBlock from './HunkBlock';

interface UpdateDocumentState {
  applied?: number;
  id?: string;
  type?: WebOnboardingDocumentType;
}

export type UpdateDocumentRenderProps = Pick<
  BuiltinRenderProps<UpdateDocumentArgs, UpdateDocumentState>,
  'args'
>;

const UpdateDocument = memo<UpdateDocumentRenderProps>(({ args }) => {
  const { t } = useTranslation('plugin');
  const hunks: MarkdownPatchHunk[] = args?.hunks ?? [];

  if (hunks.length === 0) return null;

  const totalLabel = t('builtins.orvilo-web-onboarding.inspector.hunkCount', {
    count: hunks.length,
  });

  return (
    <Flexbox gap={12}>
      {hunks.map((hunk, i) => (
        <HunkBlock countLabel={i === 0 ? totalLabel : undefined} hunk={hunk} key={i} />
      ))}
    </Flexbox>
  );
});

export default UpdateDocument;
