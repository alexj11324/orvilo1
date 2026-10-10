'use client';

import type { MarkdownPatchHunk } from '@orvilo/markdown-patch';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const styles = {
  added:
    'overflow-auto max-h-50 m-0 py-1.5 px-2.5 border-s-2 border-success rounded-l-none rounded-r-(--radius-card) font-mono text-sm leading-5.5 text-foreground [word-break:break-word] whitespace-pre-wrap bg-success-wash',
  block: 'flex flex-col gap-1.5',
  count: 'shrink-0 ms-auto text-xs leading-5 font-normal text-foreground-tertiary',
  label: 'flex gap-2 items-center text-xs leading-5 font-medium text-muted-foreground',
  lineRange:
    'py-0.25 px-1.5 rounded-(--radius-chip) font-mono text-xs leading-5 text-foreground-tertiary bg-muted',
  removed:
    'overflow-auto max-h-50 m-0 py-1.5 px-2.5 border-s-2 border-destructive rounded-l-none rounded-r-(--radius-card) font-mono text-sm leading-5.5 text-muted-foreground [word-break:break-word] whitespace-pre-wrap bg-destructive-wash',
};

interface HunkBlockProps {
  countLabel?: string;
  hunk: MarkdownPatchHunk;
}

interface HunkContent {
  added?: string;
  labelKey:
    | 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.delete'
    | 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.deleteLines'
    | 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.insertAt'
    | 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.replace'
    | 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.replaceLines';
  lineRange?: string;
  removed?: string;
}

const resolveHunk = (hunk: MarkdownPatchHunk): HunkContent => {
  switch (hunk.mode) {
    case 'delete': {
      return {
        labelKey: 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.delete',
        removed: hunk.search,
      };
    }
    case 'deleteLines': {
      return {
        labelKey: 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.deleteLines',
        lineRange: `${hunk.startLine}–${hunk.endLine}`,
      };
    }
    case 'insertAt': {
      return {
        added: hunk.content,
        labelKey: 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.insertAt',
        lineRange: `L${hunk.line}`,
      };
    }
    case 'replaceLines': {
      return {
        added: hunk.content,
        labelKey: 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.replaceLines',
        lineRange: `${hunk.startLine}–${hunk.endLine}`,
      };
    }
    default: {
      // 'replace' or undefined — both shapes are MarkdownPatchReplaceHunk
      return {
        added: hunk.replace,
        labelKey: 'builtins.orvilo-web-onboarding.updateDocument.hunkMode.replace',
        removed: hunk.search,
      };
    }
  }
};

const HunkBlock = memo<HunkBlockProps>(({ countLabel, hunk }) => {
  const { t } = useTranslation('plugin');
  const { added, labelKey, lineRange, removed } = resolveHunk(hunk);

  const blocks: ReactNode[] = [];
  if (removed)
    blocks.push(
      <pre className={styles.removed} key="removed">
        {removed}
      </pre>,
    );
  if (added)
    blocks.push(
      <pre className={styles.added} key="added">
        {added}
      </pre>,
    );

  return (
    <div className={styles.block}>
      <div className={styles.label}>
        <span>{t(labelKey)}</span>
        {lineRange && <span className={styles.lineRange}>{lineRange}</span>}
        {countLabel && <span className={styles.count}>{countLabel}</span>}
      </div>
      {blocks}
    </div>
  );
});

HunkBlock.displayName = 'HunkBlock';

export default HunkBlock;
