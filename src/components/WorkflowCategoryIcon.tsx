import type { TaskWorkflowCategory } from '@orvilo/types';
import type { CSSProperties, FC, ReactNode, Ref } from 'react';
import { useId } from 'react';

/**
 * Props `@lobehub/ui`'s `<Icon>` hands a custom icon component. Only color and
 * size are honoured — the lucide stroke/fill knobs would break the fixed
 * geometry below.
 */
export interface StatusIconProps {
  className?: string;
  color?: string;
  ref?: Ref<SVGSVGElement>;
  size?: number | string;
  style?: CSSProperties;
}

export type StatusIconComponent = FC<StatusIconProps>;

/*
 * Geometry traced from Linear's own workflow-state glyphs (14×14): an r=6
 * outer ring (dashed for backlog) and an r=2 inner pie whose dash offset is
 * the progress share — empty for todo, half for in progress, three quarters
 * for in review. Terminal states fill the disc and knock a check / cross out
 * of it. The constants are Linear's, kept verbatim so the pie reads the same.
 *
 * The check / cross / arrows are a real cut-out (an SVG mask), not a path
 * painted in some background token: the same mark sits on rows, elevated
 * board cards and translucent hover fills, and only a transparent hole reads
 * right on all of them.
 */
const PIE_LENGTH = 12.189_379_495_928_398;
const PIE_DASH = `${PIE_LENGTH} ${PIE_LENGTH * 2}`;

const Ring = ({ color, dashed }: { color: string; dashed?: boolean }) => (
  <circle
    cx={7}
    cy={7}
    fill={'none'}
    r={6}
    stroke={color}
    strokeDasharray={dashed ? '1.4 1.74' : '3.14 0'}
    strokeDashoffset={dashed ? 0.65 : -0.7}
    strokeWidth={1.5}
  />
);

const Pie = ({ color, progress }: { color: string; progress: number }) => (
  <circle
    cx={7}
    cy={7}
    fill={'none'}
    r={2}
    stroke={color}
    strokeDasharray={PIE_DASH}
    strokeDashoffset={PIE_LENGTH * (1 - progress)}
    strokeWidth={4}
    transform={'rotate(-90 7 7)'}
  />
);

// The mask sits on an untransformed group: on the rotated circle itself the
// user-space mask would rotate with it and turn the check sideways.
const FullDisc = ({ color, mask }: { color: string; mask: string }) => (
  <g mask={mask}>
    <circle
      cx={7}
      cy={7}
      fill={'none'}
      r={3}
      stroke={color}
      strokeDasharray={'18.84955592153876 37.69911184307752'}
      strokeDashoffset={0}
      strokeWidth={6}
      transform={'rotate(-90 7 7)'}
    />
  </g>
);

/** Mask that keeps everything except `d`, so the shape it clips shows a hole there. */
const KnockoutMask = ({ d, id }: { d: string; id: string }) => (
  <mask height={14} id={id} maskUnits={'userSpaceOnUse'} width={14} x={0} y={0}>
    <rect fill={'white'} height={14} width={14} />
    <path d={d} fill={'black'} />
  </mask>
);

const CHECK_PATH =
  'M10.951 4.24896C11.283 4.58091 11.283 5.11909 10.951 5.45104L5.95104 10.451C5.61909 10.783 5.0809 10.783 4.74896 10.451L2.74896 8.45104C2.41701 8.11909 2.41701 7.5809 2.74896 7.24896C3.0809 6.91701 3.61909 6.91701 3.95104 7.24896L5.35 8.64792L9.74896 4.24896C10.0809 3.91701 10.6191 3.91701 10.951 4.24896Z';
const CROSS_PATH =
  'M3.73657 3.73657C4.05199 3.42114 4.56339 3.42114 4.87881 3.73657L7 5.85775L9.12117 3.73657C9.4366 3.42114 9.94801 3.42114 10.2634 3.73657C10.5789 4.05199 10.5789 4.56339 10.2634 4.87881L8.14225 7L10.2634 9.12118C10.5789 9.4366 10.5789 9.94801 10.2634 10.2634C9.94801 10.5789 9.4366 10.5789 9.12117 10.2634L7 8.14225L4.87881 10.2634C4.56339 10.5789 4.05199 10.5789 3.73657 10.2634C3.42114 9.94801 3.42114 9.4366 3.73657 9.12118L5.85775 7L3.73657 4.87881C3.42114 4.56339 3.42114 4.05199 3.73657 3.73657Z';
const TRIAGE_PATH =
  'M8.0126 7.98223V9.50781C8.0126 9.92901 8.52329 10.1548 8.85102 9.87854L11.8258 7.37066C12.0581 7.17486 12.0581 6.82507 11.8258 6.62927L8.85102 4.12139C8.52329 3.84509 8.0126 4.07092 8.0126 4.49212V6.01763H5.98739V4.49218C5.98739 4.07098 5.4767 3.84515 5.14897 4.12146L2.17419 6.62933C1.94194 6.82513 1.94194 7.17492 2.17419 7.37072L5.14897 9.8786C5.4767 10.1549 5.98739 9.92907 5.98739 9.50787V7.98223H8.0126Z';

const createStatusIcon = (
  name: string,
  renderShape: (color: string, maskId: string) => ReactNode,
): StatusIconComponent => {
  const StatusIcon: StatusIconComponent = ({
    className,
    color = 'currentColor',
    ref,
    size = 14,
    style,
  }) => {
    // Per-instance id: many icons share a page, and mask ids are document-global.
    const maskId = `wf-knockout-${useId().replaceAll(':', '')}`;
    return (
      <svg
        aria-hidden
        className={className}
        data-workflow-icon={name}
        fill={'none'}
        height={size}
        ref={ref}
        style={style}
        viewBox={'0 0 14 14'}
        width={size}
      >
        {renderShape(color, maskId)}
      </svg>
    );
  };
  StatusIcon.displayName = `WorkflowIcon(${name})`;
  return StatusIcon;
};

export const WORKFLOW_CATEGORY_ICONS: Record<TaskWorkflowCategory, StatusIconComponent> = {
  backlog: createStatusIcon('backlog', (color) => (
    <>
      <Ring dashed color={color} />
      <Pie color={color} progress={0} />
    </>
  )),
  canceled: createStatusIcon('canceled', (color, maskId) => (
    <>
      <KnockoutMask d={CROSS_PATH} id={maskId} />
      <Ring color={color} />
      <FullDisc color={color} mask={`url(#${maskId})`} />
    </>
  )),
  done: createStatusIcon('done', (color, maskId) => (
    <>
      <KnockoutMask d={CHECK_PATH} id={maskId} />
      <Ring color={color} />
      <FullDisc color={color} mask={`url(#${maskId})`} />
    </>
  )),
  in_progress: createStatusIcon('in_progress', (color) => (
    <>
      <Ring color={color} />
      <Pie color={color} progress={0.5} />
    </>
  )),
  in_review: createStatusIcon('in_review', (color) => (
    <>
      <Ring color={color} />
      <Pie color={color} progress={0.75} />
    </>
  )),
  todo: createStatusIcon('todo', (color) => (
    <>
      <Ring color={color} />
      <Pie color={color} progress={0} />
    </>
  )),
  triage: createStatusIcon('triage', (color, maskId) => (
    <>
      <KnockoutMask d={TRIAGE_PATH} id={maskId} />
      <circle
        cx={7}
        cy={7}
        fill={'none'}
        mask={`url(#${maskId})`}
        r={3.5}
        stroke={color}
        strokeDasharray={'2 0'}
        strokeDashoffset={3.2}
        strokeWidth={7}
      />
    </>
  )),
};

const STATUS_PROPERTY_PATH =
  'M13.9408 7.91426L11.9576 7.65557C11.9855 7.4419 12 7.22314 12 7C12 6.77686 11.9855 6.5581 11.9576 6.34443L13.9408 6.08573C13.9799 6.38496 14 6.69013 14 7C14 7.30987 13.9799 7.61504 13.9408 7.91426ZM13.4688 4.32049C13.2328 3.7514 12.9239 3.22019 12.5538 2.73851L10.968 3.95716C11.2328 4.30185 11.4533 4.68119 11.6214 5.08659L13.4688 4.32049ZM11.2615 1.4462L10.0428 3.03204C9.69815 2.76716 9.31881 2.54673 8.91341 2.37862L9.67951 0.531163C10.2486 0.767153 10.7798 1.07605 11.2615 1.4462ZM7.91426 0.0591659L7.65557 2.04237C7.4419 2.01449 7.22314 2 7 2C6.77686 2 6.5581 2.01449 6.34443 2.04237L6.08574 0.059166C6.38496 0.0201343 6.69013 0 7 0C7.30987 0 7.61504 0.0201343 7.91426 0.0591659ZM4.32049 0.531164L5.08659 2.37862C4.68119 2.54673 4.30185 2.76716 3.95716 3.03204L2.73851 1.4462C3.22019 1.07605 3.7514 0.767153 4.32049 0.531164ZM1.4462 2.73851L3.03204 3.95716C2.76716 4.30185 2.54673 4.68119 2.37862 5.08659L0.531164 4.32049C0.767153 3.7514 1.07605 3.22019 1.4462 2.73851ZM0.0591659 6.08574C0.0201343 6.38496 0 6.69013 0 7C0 7.30987 0.0201343 7.61504 0.059166 7.91426L2.04237 7.65557C2.01449 7.4419 2 7.22314 2 7C2 6.77686 2.01449 6.5581 2.04237 6.34443L0.0591659 6.08574ZM0.531164 9.67951L2.37862 8.91341C2.54673 9.31881 2.76716 9.69815 3.03204 10.0428L1.4462 11.2615C1.07605 10.7798 0.767153 10.2486 0.531164 9.67951ZM2.73851 12.5538L3.95716 10.968C4.30185 11.2328 4.68119 11.4533 5.08659 11.6214L4.32049 13.4688C3.7514 13.2328 3.22019 12.9239 2.73851 12.5538ZM6.08574 13.9408L6.34443 11.9576C6.5581 11.9855 6.77686 12 7 12C7.22314 12 7.4419 11.9855 7.65557 11.9576L7.91427 13.9408C7.61504 13.9799 7.30987 14 7 14C6.69013 14 6.38496 13.9799 6.08574 13.9408ZM9.67951 13.4688L8.91341 11.6214C9.31881 11.4533 9.69815 11.2328 10.0428 10.968L11.2615 12.5538C10.7798 12.9239 10.2486 13.2328 9.67951 13.4688ZM12.5538 11.2615L10.968 10.0428C11.2328 9.69815 11.4533 9.31881 11.6214 8.91341L13.4688 9.67951C13.2328 10.2486 12.924 10.7798 12.5538 11.2615Z';

/**
 * Linear's mark for the Status *field* itself — the monochrome dashed ring on
 * filter menus, bulk actions, context menus and activity entries. It names
 * the property, not a value, so it never takes a state color.
 */
export const StatusPropertyIcon: StatusIconComponent = ({
  className,
  color = 'currentColor',
  ref,
  size = 14,
  style,
}) => (
  <svg
    aria-hidden
    data-status-property-icon
    className={className}
    fill={color}
    height={size}
    ref={ref}
    style={style}
    viewBox={'0 0 14 14'}
    width={size}
  >
    <path d={STATUS_PROPERTY_PATH} />
  </svg>
);
StatusPropertyIcon.displayName = 'StatusPropertyIcon';
