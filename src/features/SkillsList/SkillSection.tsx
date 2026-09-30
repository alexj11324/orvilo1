import { Accordion, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo, type ReactNode, useState } from 'react';

import AsyncError from '@/components/AsyncError';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';

export interface SkillSectionHeader {
  /** Wrap the section in a collapsible Accordion. Defaults to true. */
  collapsible?: boolean;
  count?: number;
  /** Initial expansion state when collapsible. Defaults to true. */
  defaultExpanded?: boolean;
  title: string;
}

export interface SkillSectionProps {
  children?: ReactNode;
  emptyText?: string;
  /**
   * A failed fetch. When set (and there's no data), the body renders a failure +
   * Retry instead of the empty placeholder — a failed scan must not read as
   * "no skills" (ux Read §1.1).
   */
  error?: unknown;
  isEmpty?: boolean;
  isLoading?: boolean;
  /** Retry the failed fetch (SWR `mutate`). */
  onRetry?: () => void;
  /**
   * When provided, wraps content in a header + optional Accordion. Omit to
   * render `children` flat (the caller controls layout entirely).
   */
  sectionHeader?: SkillSectionHeader;
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  count: css`
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: ${cssVar.colorTextTertiary};
  `,
  empty: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  flatHeader: css`
    padding-inline: 4px;
  `,
  label: css`
    font-size: 12px;
    font-weight: 500;
  `,
}));

const ITEM_KEY = 'skill-section';

interface HeaderRowProps {
  count?: number;
  title: string;
}

const HeaderRow = memo<HeaderRowProps>(({ count, title }) => (
  <div className="flex items-center gap-1.5">
    <Text className={styles.label} type={'secondary'}>
      {title}
    </Text>
    {typeof count === 'number' && count > 0 && <span className={styles.count}>{count}</span>}
  </div>
));

HeaderRow.displayName = 'SkillSectionHeaderRow';

interface BodyProps {
  children?: ReactNode;
  emptyText?: string;
  error?: unknown;
  isEmpty?: boolean;
  isLoading?: boolean;
  onRetry?: () => void;
}

const Body = memo<BodyProps>(({ children, emptyText, error, isEmpty, isLoading, onRetry }) => {
  // Error before empty: a failed scan gets its own state, never a "no skills".
  if (error && isEmpty) {
    return (
      <div className="flex flex-col py-1 px-1">
        <AsyncError error={error} variant={'inline'} onRetry={onRetry} />
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-3">
        <NeuralNetworkLoading size={24} />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-2">
        <Text className={styles.empty}>{emptyText}</Text>
      </div>
    );
  }
  return <>{children}</>;
});

Body.displayName = 'SkillSectionBody';

const SkillSection = memo<SkillSectionProps>(
  ({ children, emptyText, error, isEmpty, isLoading, onRetry, sectionHeader }) => {
    // Hook always runs regardless of whether sectionHeader is provided.
    const [expanded, setExpanded] = useState(sectionHeader?.defaultExpanded ?? true);

    const body = (
      <Body
        emptyText={emptyText}
        error={error}
        isEmpty={isEmpty}
        isLoading={isLoading}
        onRetry={onRetry}
      >
        {children}
      </Body>
    );

    if (!sectionHeader) return body;

    const { collapsible = true, count, title } = sectionHeader;

    if (!collapsible) {
      return (
        <div className="flex flex-col gap-1">
          <div className={styles.flatHeader}>
            <HeaderRow count={count} title={title} />
          </div>
          {body}
        </div>
      );
    }

    return (
      <Accordion
        gap={4}
        indicatorPlacement="inline"
        styles={{ trigger: { paddingBlock: 2, paddingInline: 4 } }}
        value={expanded ? [ITEM_KEY] : []}
        items={[
          { key: ITEM_KEY, title: <HeaderRow count={count} title={title} />, children: body },
        ]}
        onValueChange={(keys) => setExpanded(keys.length > 0)}
      />
    );
  },
);

SkillSection.displayName = 'SkillSection';

export default SkillSection;
