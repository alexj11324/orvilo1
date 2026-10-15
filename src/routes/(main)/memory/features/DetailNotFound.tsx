'use client';

import { FileQuestionIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Resolved not-found for a memory detail panel: the fetch succeeded but the item
 * is gone (deleted elsewhere). Distinct from a fetch *error* — which
 * `AsyncBoundary` renders via `AsyncError` with a Reload — so a deleted item
 * never masquerades as a transient failure (and vice-versa).
 */
const DetailNotFound = memo(() => {
  const { t } = useTranslation('memory');

  return (
    <div
      className="flex flex-col items-center justify-center flex-1 gap-3 p-12"
      style={{ width: '100%' }}
    >
      <FileQuestionIcon className="size-5 text-foreground-tertiary" size={20} />
      <div className="flex flex-col items-center gap-1">
        <div className="text-base font-semibold">{t('detail.notFound.title')}</div>
        <div
          className="text-center text-(length:--text-dense)"
          style={{ maxWidth: 320, color: 'var(--foreground-tertiary)' }}
        >
          {t('detail.notFound.desc')}
        </div>
      </div>
    </div>
  );
});

export default DetailNotFound;
