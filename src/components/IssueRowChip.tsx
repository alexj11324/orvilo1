'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import type { HTMLAttributes, ReactNode, Ref } from 'react';

/*
 * Measured off Linear's issue rows (Brave, CDP): every property chip on a row
 * — labels, sub-issue progress, milestone, project — is the same 24px pill
 * with a hairline 0.5px border, 8px inline padding, a 14px leading icon and
 * 12px / 450 secondary text. The marketing-site design notes say chips are
 * 4–6px squares; the app itself draws pills, and the app is what we match.
 */
const styles = createStaticStyles(({ css }) => ({
  chip: css`
    display: inline-flex;
    flex: none;
    gap: 6px;
    align-items: center;

    box-sizing: border-box;
    max-width: 200px;
    height: 24px;
    padding-block: 0;
    padding-inline: 8px;
    border: 0.5px solid ${cssVar.colorBorder};
    border-radius: 48px;

    font-size: 12px;
    font-weight: 450;
    line-height: 1;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    background: ${cssVar.colorFillQuaternary};
  `,
  icon: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 14px;
    height: 14px;
  `,
  interactive: css`
    cursor: pointer;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  suffix: css`
    flex: none;
  `,
  text: css`
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
  `,
}));

export interface IssueRowChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children?: ReactNode;
  /** Leading 14px glyph; the chip centres it in a fixed box. */
  icon?: ReactNode;
  ref?: Ref<HTMLSpanElement>;
  /** Trailing text that never truncates (a milestone's date) — the name gives way first. */
  suffix?: ReactNode;
}

/**
 * The one pill every issue-row property chip uses. Rest props land on the
 * root span so it can sit directly inside a dropdown / tooltip trigger.
 */
const IssueRowChip = ({
  children,
  className,
  icon,
  onClick,
  ref,
  suffix,
  ...rest
}: IssueRowChipProps) => (
  <span
    data-issue-row-chip
    className={[styles.chip, onClick && styles.interactive, className].filter(Boolean).join(' ')}
    ref={ref}
    onClick={onClick}
    {...rest}
  >
    {icon ? <span className={styles.icon}>{icon}</span> : null}
    {children === undefined || children === null ? null : (
      <span className={styles.text}>{children}</span>
    )}
    {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
  </span>
);

export default IssueRowChip;
