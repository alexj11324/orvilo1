'use client';

import { clsx, cn } from 'cn';
import { mergeWith } from 'es-toolkit/compat';
import isEqual from 'fast-deep-equal';
import { Check, CircleAlert, Info, type LucideIcon, TriangleAlert } from 'lucide-react';
import {
  type ComponentProps,
  type ComponentType,
  createContext,
  createElement,
  type CSSProperties,
  Fragment,
  type HTMLAttributes,
  isValidElement,
  type ReactNode,
  type Ref,
  use,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';

import { FormControlProvider, useFormControlContext } from '@/components/FormControlContext';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useSingleton } from '@/hooks/useSingleton';

import type {
  FieldData,
  FieldRegistration,
  FormCallbacks,
  FormEngine,
  FormInstance,
  NamePath,
  Rule,
} from './formEngine';
import { createLocalForm, engineOf, getAt, toPath } from './formEngine';

export type {
  FieldData,
  FormInstance,
  NamePath,
  Rule,
  ValidateOptions,
  ValidationFailure,
} from './formEngine';

type FormVariant = 'borderless' | 'filled' | 'outlined';
type Layout = 'horizontal' | 'inline' | 'vertical';
type Status = '' | 'error' | 'success' | 'validating' | 'warning';
type SemanticNames = { content?: string; label?: string; root?: string; item?: string };
type SemanticStyles = { content?: CSSProperties; label?: CSSProperties; root?: CSSProperties };
type ColumnSize = {
  flex?: string | number;
  span?: number;
  offset?: number;
  order?: number;
  pull?: number;
  push?: number;
};
type Column = ColumnSize &
  Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    className?: string;
    style?: CSSProperties;
    xs?: number | ColumnSize;
    sm?: number | ColumnSize;
    md?: number | ColumnSize;
    lg?: number | ColumnSize;
    xl?: number | ColumnSize;
    xxl?: number | ColumnSize;
    xxxl?: number | ColumnSize;
  };

export interface FormItemProps extends FieldRegistration {
  avatar?: ReactNode;
  children?: ReactNode | ((form: FormInstance) => ReactNode);
  className?: string;
  colon?: boolean;
  desc?: ReactNode;
  divider?: boolean;
  extra?: ReactNode;
  fieldKey?: number;
  getValueFromEvent?: (...args: any[]) => any;
  getValueProps?: (value: any) => Record<string, any>;
  hasFeedback?:
    | boolean
    | {
        icons?: (status: {
          status: Status;
          errors?: ReactNode[];
          warnings?: ReactNode[];
        }) => Partial<Record<Status, ReactNode>>;
      };
  help?: ReactNode;
  hidden?: boolean;
  htmlFor?: string;
  id?: string;
  label?: ReactNode;
  labelAlign?: 'left' | 'right';
  labelCol?: Column;
  labelWrap?: boolean;
  layout?: 'horizontal' | 'vertical';
  minWidth?: string | number;
  name?: NamePath;
  normalize?: (value: any, previous: any, values: any) => any;
  noStyle?: boolean;
  prefixCls?: string;
  required?: boolean;
  rootClassName?: string;
  shouldUpdate?: boolean | ((previous: any, current: any) => boolean);
  style?: CSSProperties;
  tag?: ReactNode;
  tooltip?: ReactNode | { title?: ReactNode; icon?: ReactNode };
  trigger?: string;
  validateDebounce?: number;
  validateStatus?: Status;
  validateTrigger?: string | string[] | false;
  valuePropName?: string;
  variant?: FormVariant;
  wrapperCol?: Column;
}

export interface FormGroupItemType {
  children?: FormItemProps[] | ReactNode;
  collapsible?: boolean;
  defaultActive?: boolean;
  desc?: ReactNode;
  extra?: ReactNode;
  icon?: LucideIcon;
  key?: string;
  title: ReactNode;
  variant?: FormVariant;
}

export interface FormProps
  extends Omit<ComponentProps<'form'>, 'children' | 'onSubmit' | 'ref'>, FormCallbacks {
  children?: ReactNode | ((values: any, form: FormInstance) => ReactNode);
  classNames?: SemanticNames | ((info: { props: FormProps }) => SemanticNames);
  clearOnDestroy?: boolean;
  collapsible?: boolean;
  colon?: boolean;
  component?: false | string | ComponentType<any>;
  defaultActive?: boolean;
  disabled?: boolean;
  feedbackIcons?: (status: {
    status: Status;
    errors?: ReactNode[];
    warnings?: ReactNode[];
  }) => Partial<Record<Status, ReactNode>>;
  fields?: FieldData[];
  footer?: ReactNode;
  form?: FormInstance;
  gap?: number | string;
  initialValues?: Record<string, any>;
  itemMinWidth?: number | string;
  items?: (FormGroupItemType | FormItemProps)[];
  itemsType?: 'flat' | 'group';
  itemVariant?: FormVariant;
  labelAlign?: 'left' | 'right';
  labelCol?: Column;
  labelWrap?: boolean;
  layout?: Layout;
  onReset?: ComponentProps<'form'>['onReset'];
  onSubmit?: ComponentProps<'form'>['onSubmit'];
  prefixCls?: string;
  preserve?: boolean;
  ref?: Ref<FormInstance & { nativeElement: HTMLElement | null }>;
  requiredMark?:
    boolean | 'optional' | ((label: ReactNode, info: { required: boolean }) => ReactNode);
  rootClassName?: string;
  scrollToFirstError?: boolean | (ScrollIntoViewOptions & { focus?: boolean });
  size?: 'small' | 'middle' | 'large';
  styles?: SemanticStyles | ((info: { props: FormProps }) => SemanticStyles);
  tooltip?: FormItemProps['tooltip'];
  validateMessages?: Record<string, any>;
  validateTrigger?: string | string[] | false;
  variant?: FormVariant;
  wrapperCol?: Column;
}

interface FormContextValue {
  classNames: SemanticNames;
  engine: FormEngine;
  props: FormProps;
  styles: SemanticStyles;
}
const FormContext = createContext<FormContextValue | null>(null);
const ListContext = createContext<Array<string | number>>([]);
const StatusContext = createContext<{ status: Status; errors: ReactNode[]; warnings: ReactNode[] }>(
  { status: '', errors: [], warnings: [] },
);
const NoStyleContext = createContext<
  ((key: string, meta?: { errors: ReactNode[]; warnings: ReactNode[] }) => void) | null
>(null);
const ProviderContext = createContext<{
  change: (name: string, fields: FieldData[]) => void;
  finish: (name: string, values: any) => void;
  register: (name: string, form: FormInstance) => () => void;
  validateMessages?: Record<string, any>;
} | null>(null);

const variantClassName: Record<FormVariant, string> = {
  borderless: '',
  filled: 'bg-secondary rounded-(--radius-card)',
  outlined: 'border border-border rounded-(--radius-card)',
};
const gapClasses: Record<number, string> = {
  0: 'gap-0',
  2: 'gap-0.5',
  4: 'gap-1',
  6: 'gap-1.5',
  8: 'gap-2',
  10: 'gap-2.5',
  12: 'gap-3',
  16: 'gap-4',
  20: 'gap-5',
  24: 'gap-6',
  32: 'gap-8',
};
const gapClass = (gap: number | string) => (typeof gap === 'number' ? gapClasses[gap] : undefined);
const gapStyle = (gap: number | string) => (gapClass(gap) ? undefined : { gap });
// Public 24-column geometry is runtime data. The finite utilities keep the
// original xs default and 576, 768, 992, 1200 and 1600 and 1920px minimum boundaries.
const columnUtilities = {
  base: {
    flex: 'flex-(--form-col-base-flex)',
    span: 'grow-0 shrink-0 basis-(--form-col-base-span) max-w-(--form-col-base-span)',
    offset: 'ms-(--form-col-base-offset)',
    order: 'order-(--form-col-base-order)',
    push: 'relative [inset-inline-start:var(--form-col-base-push)]',
    pull: 'relative [inset-inline-end:var(--form-col-base-pull)]',
    hidden: 'hidden',
    visible: 'flex',
  },
  sm: {
    flex: 'min-[576px]:flex-(--form-col-sm-flex)',
    span: 'min-[576px]:grow-0 min-[576px]:shrink-0 min-[576px]:basis-(--form-col-sm-span) min-[576px]:max-w-(--form-col-sm-span)',
    offset: 'min-[576px]:ms-(--form-col-sm-offset)',
    order: 'min-[576px]:order-(--form-col-sm-order)',
    push: 'min-[576px]:relative min-[576px]:[inset-inline-start:var(--form-col-sm-push)]',
    pull: 'min-[576px]:relative min-[576px]:[inset-inline-end:var(--form-col-sm-pull)]',
    hidden: 'min-[576px]:hidden',
    visible: 'min-[576px]:flex',
  },
  md: {
    flex: 'min-[768px]:flex-(--form-col-md-flex)',
    span: 'min-[768px]:grow-0 min-[768px]:shrink-0 min-[768px]:basis-(--form-col-md-span) min-[768px]:max-w-(--form-col-md-span)',
    offset: 'min-[768px]:ms-(--form-col-md-offset)',
    order: 'min-[768px]:order-(--form-col-md-order)',
    push: 'min-[768px]:relative min-[768px]:[inset-inline-start:var(--form-col-md-push)]',
    pull: 'min-[768px]:relative min-[768px]:[inset-inline-end:var(--form-col-md-pull)]',
    hidden: 'min-[768px]:hidden',
    visible: 'min-[768px]:flex',
  },
  lg: {
    flex: 'min-[992px]:flex-(--form-col-lg-flex)',
    span: 'min-[992px]:grow-0 min-[992px]:shrink-0 min-[992px]:basis-(--form-col-lg-span) min-[992px]:max-w-(--form-col-lg-span)',
    offset: 'min-[992px]:ms-(--form-col-lg-offset)',
    order: 'min-[992px]:order-(--form-col-lg-order)',
    push: 'min-[992px]:relative min-[992px]:[inset-inline-start:var(--form-col-lg-push)]',
    pull: 'min-[992px]:relative min-[992px]:[inset-inline-end:var(--form-col-lg-pull)]',
    hidden: 'min-[992px]:hidden',
    visible: 'min-[992px]:flex',
  },
  xl: {
    flex: 'min-[1200px]:flex-(--form-col-xl-flex)',
    span: 'min-[1200px]:grow-0 min-[1200px]:shrink-0 min-[1200px]:basis-(--form-col-xl-span) min-[1200px]:max-w-(--form-col-xl-span)',
    offset: 'min-[1200px]:ms-(--form-col-xl-offset)',
    order: 'min-[1200px]:order-(--form-col-xl-order)',
    push: 'min-[1200px]:relative min-[1200px]:[inset-inline-start:var(--form-col-xl-push)]',
    pull: 'min-[1200px]:relative min-[1200px]:[inset-inline-end:var(--form-col-xl-pull)]',
    hidden: 'min-[1200px]:hidden',
    visible: 'min-[1200px]:flex',
  },
  xxl: {
    flex: 'min-[1600px]:flex-(--form-col-xxl-flex)',
    span: 'min-[1600px]:grow-0 min-[1600px]:shrink-0 min-[1600px]:basis-(--form-col-xxl-span) min-[1600px]:max-w-(--form-col-xxl-span)',
    offset: 'min-[1600px]:ms-(--form-col-xxl-offset)',
    order: 'min-[1600px]:order-(--form-col-xxl-order)',
    push: 'min-[1600px]:relative min-[1600px]:[inset-inline-start:var(--form-col-xxl-push)]',
    pull: 'min-[1600px]:relative min-[1600px]:[inset-inline-end:var(--form-col-xxl-pull)]',
    hidden: 'min-[1600px]:hidden',
    visible: 'min-[1600px]:flex',
  },
  xxxl: {
    flex: 'min-[1920px]:flex-(--form-col-xxxl-flex)',
    span: 'min-[1920px]:grow-0 min-[1920px]:shrink-0 min-[1920px]:basis-(--form-col-xxxl-span) min-[1920px]:max-w-(--form-col-xxxl-span)',
    offset: 'min-[1920px]:ms-(--form-col-xxxl-offset)',
    order: 'min-[1920px]:order-(--form-col-xxxl-order)',
    push: 'min-[1920px]:relative min-[1920px]:[inset-inline-start:var(--form-col-xxxl-push)]',
    pull: 'min-[1920px]:relative min-[1920px]:[inset-inline-end:var(--form-col-xxxl-pull)]',
    hidden: 'min-[1920px]:hidden',
    visible: 'min-[1920px]:flex',
  },
};
const columnSizes = (column: Column) =>
  (['base', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'] as const).map((key) => {
    const xs = typeof column.xs === 'number' ? { span: column.xs } : column.xs;
    const value = key === 'base' ? { ...column, ...xs } : column[key];
    return { key, value: typeof value === 'number' ? { span: value } : value };
  });
const columnClass = (column?: Column) =>
  column &&
  columnSizes(column).flatMap(({ key, value }) => {
    if (!value) return [];
    const utility = columnUtilities[key];
    return [
      value.span !== undefined && value.flex === undefined && utility.span,
      value.flex !== undefined && utility.flex,
      value.span !== undefined && (value.span === 0 ? utility.hidden : utility.visible),
      value.offset !== undefined && utility.offset,
      value.order !== undefined && utility.order,
      value.push !== undefined && utility.push,
      value.pull !== undefined && utility.pull,
    ];
  });
const parseFlex = (flex: string | number) =>
  typeof flex === 'number'
    ? `${flex} ${flex} auto`
    : /^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(flex)
      ? `0 0 ${flex}`
      : flex;
const columnStyle = (column?: Column): CSSProperties | undefined => {
  if (!column) return;
  const result: CSSProperties & { [key: `--form-col-${string}`]: string | number | undefined } = {};
  for (const { key, value } of columnSizes(column)) {
    if (!value) continue;
    if (value.flex !== undefined) result[`--form-col-${key}-flex`] = parseFlex(value.flex);
    if (value.span !== undefined) result[`--form-col-${key}-span`] = `${(value.span / 24) * 100}%`;
    if (value.offset !== undefined)
      result[`--form-col-${key}-offset`] = `${(value.offset / 24) * 100}%`;
    if (value.order !== undefined) result[`--form-col-${key}-order`] = value.order;
    if (value.push !== undefined)
      result[`--form-col-${key}-push`] = value.push === 0 ? 'auto' : `${(value.push / 24) * 100}%`;
    if (value.pull !== undefined)
      result[`--form-col-${key}-pull`] = value.pull === 0 ? 'auto' : `${(value.pull / 24) * 100}%`;
  }
  return {
    ...result,
    ...(column.flex !== undefined ? { flex: parseFlex(column.flex) } : {}),
    ...column.style,
  };
};
const columnDomProps = (column?: Column) =>
  column &&
  Object.fromEntries(
    Object.entries(column).filter(
      ([key]) =>
        ![
          'className',
          'style',
          'span',
          'offset',
          'order',
          'pull',
          'push',
          'flex',
          'xs',
          'sm',
          'md',
          'lg',
          'xl',
          'xxl',
          'xxxl',
        ].includes(key),
    ),
  );
const useVersion = (engine: FormEngine) =>
  useSyncExternalStore(engine.subscribe, engine.snapshot, engine.snapshot);
const useContextForm = () => {
  const context = use(FormContext);
  if (!context) throw new Error('Form.Item and Form.List require a surrounding GroupForm.');
  return context;
};

function useForm<T = any>(instance?: FormInstance<T>): [FormInstance<T>] {
  const local = useRef<FormInstance<T> | undefined>(undefined);
  if (!local.current) local.current = instance ?? createLocalForm<T>().form;
  return [instance ?? local.current];
}
function useFormInstance<T = any>(): FormInstance<T> {
  return useContextForm().engine.form;
}
function useWatch<T = any>(
  name?: NamePath | ((values: any) => T),
  formOrOptions?: FormInstance | { form?: FormInstance; preserve?: boolean },
): T | undefined {
  const context = use(FormContext);
  const explicit =
    formOrOptions && 'getFieldValue' in formOrOptions ? formOrOptions : formOrOptions?.form;
  const engine = explicit ? engineOf(explicit) : context?.engine;
  if (!engine) throw new Error('Form.useWatch requires a form instance or surrounding GroupForm.');
  useVersion(engine);
  const values = engine.form.getFieldsValue(
    formOrOptions && 'preserve' in formOrOptions && formOrOptions.preserve ? true : undefined,
  );
  return typeof name === 'function'
    ? name(values)
    : name === undefined || toPath(name).length === 0
      ? values
      : getAt(values, name);
}

function ErrorList({
  errors = [],
  warnings = [],
  help,
  className,
  helpStatus,
}: {
  errors?: ReactNode[];
  warnings?: ReactNode[];
  help?: ReactNode;
  className?: string;
  fieldId?: string;
  helpStatus?: Status;
}) {
  return (
    <>
      {help !== undefined ? (
        helpStatus === 'error' ? (
          <FieldError className={className}>{help}</FieldError>
        ) : (
          <div
            className={clsx(
              cn(
                'text-sm',
                helpStatus === 'warning' ? 'text-warning-text' : 'text-foreground-description',
              ),
              className,
            )}
          >
            {help}
          </div>
        )
      ) : (
        errors.length > 0 && (
          <FieldError className={className}>
            {errors.map((error, index) => (
              <div key={index}>{error}</div>
            ))}
          </FieldError>
        )
      )}
      {warnings.length > 0 && (
        <div className={clsx('text-sm text-warning-text', className)}>
          {warnings.map((warning, index) => (
            <div key={index}>{warning}</div>
          ))}
        </div>
      )}
    </>
  );
}

function FormItem(props: FormItemProps) {
  const context = useContextForm();
  const { t } = useTranslation('ui');
  const { engine } = context;
  useVersion(engine);
  const prefix = use(ListContext);
  const {
    children,
    className,
    colon = context.props.colon,
    dependencies,
    extra,
    getValueFromEvent,
    getValueProps,
    hasFeedback,
    help,
    hidden,
    htmlFor,
    id,
    initialValue,
    label,
    labelAlign = context.props.labelAlign,
    labelCol = context.props.labelCol,
    labelWrap = context.props.labelWrap,
    layout = context.props.layout ?? 'horizontal',
    messageVariables,
    name,
    noStyle,
    normalize,
    prefixCls = context.props.prefixCls ?? 'ant-form',
    preserve,
    required,
    rootClassName,
    rules,
    shouldUpdate,
    style,
    tooltip = context.props.tooltip,
    trigger = 'onChange',
    validateDebounce,
    validateFirst,
    validateStatus,
    validateTrigger = context.props.validateTrigger ?? 'onChange',
    valuePropName = 'value',
    wrapperCol = context.props.wrapperCol,
  } = props;
  const path = name === undefined ? undefined : [...prefix, ...toPath(name)];
  const pathKey = JSON.stringify(path);
  const currentPath = useRef(path);
  currentPath.current = path;
  const token = useSingleton(() => Symbol('field'));
  const configuration = useRef<FieldRegistration>({});
  configuration.current = {
    dependencies,
    initialValue,
    label,
    messageVariables,
    preserve,
    rules,
    validateFirst,
  };
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const registeredPath = currentPath.current;
    if (!registeredPath) return;
    return engine.register(registeredPath, token, () => configuration.current);
  }, [engine, pathKey, token]);
  useEffect(() => () => clearTimeout(timeout.current), []);
  const emptyMeta = useSingleton(() => ({
    errors: [] as ReactNode[],
    warnings: [] as ReactNode[],
    validating: false,
    validated: false,
  }));
  const ownMeta = path ? engine.meta(path) : emptyMeta;
  const parentNoStyle = use(NoStyleContext);
  const [nested, setNested] = useState<
    Record<string, { errors: ReactNode[]; warnings: ReactNode[] }>
  >({});
  const collectNoStyle = useCallback(
    (key: string, meta?: { errors: ReactNode[]; warnings: ReactNode[] }) => {
      setNested((current) => {
        if (isEqual(current[key], meta)) return current;
        const next = { ...current };
        if (meta) next[key] = meta;
        else delete next[key];
        return next;
      });
    },
    [],
  );
  const nestedMeta = useMemo(
    () => ({
      errors: [...ownMeta.errors, ...Object.values(nested).flatMap((item) => item.errors)],
      warnings: [...ownMeta.warnings, ...Object.values(nested).flatMap((item) => item.warnings)],
    }),
    [ownMeta.errors, ownMeta.warnings, nested],
  );
  const meta = { ...ownMeta, ...nestedMeta };
  const status =
    validateStatus ??
    (meta.validating
      ? 'validating'
      : meta.errors.length
        ? 'error'
        : meta.warnings.length
          ? 'warning'
          : meta.validated
            ? 'success'
            : '');
  const generatedId = useId();
  useEffect(() => {
    if (noStyle) parentNoStyle?.(generatedId, nestedMeta);
  }, [generatedId, noStyle, parentNoStyle, nestedMeta]);
  useEffect(
    () => () => {
      if (noStyle) parentNoStyle?.(generatedId);
    },
    [generatedId, noStyle, parentNoStyle],
  );
  const childId = isValidElement(children) ? (children.props as Record<string, any>).id : undefined;
  const controlId =
    id ??
    childId ??
    (path ? `${context.props.name ?? generatedId}_${path.join('_')}` : generatedId);
  configuration.current.fieldId = controlId;
  const messageId = `${controlId}_help`;
  const previousRender = useRef<{ values: any; children: ReactNode } | undefined>(undefined);
  let content: ReactNode;
  if (typeof children === 'function') {
    const values = engine.form.getFieldsValue(true);
    const previous = previousRender.current;
    content =
      previous && typeof shouldUpdate === 'function' && !shouldUpdate(previous.values, values)
        ? previous.children
        : children(engine.form);
    previousRender.current = { children: content, values };
  } else {
    content = children;
    const only = isValidElement(children)
      ? (children as React.ReactElement<Record<string, any>>)
      : undefined;
    if (only) {
      const bound: Record<string, any> = {
        disabled: only.props.disabled ?? context.props.disabled,
        id: only.props.id ?? controlId,
      };
      if (path) {
        const raw = engine.form.getFieldValue(path);
        const value = raw === undefined && !engine.hasField(path) ? initialValue : raw;
        Object.assign(bound, getValueProps ? getValueProps(value) : { [valuePropName]: value });
        const original = only.props[trigger];
        bound[trigger] = (...args: any[]) => {
          const event = args[0];
          let next = getValueFromEvent
            ? getValueFromEvent(...args)
            : event &&
                typeof event === 'object' &&
                'target' in event &&
                event.target &&
                valuePropName in event.target
              ? event.target[valuePropName]
              : event;
          if (normalize)
            next = normalize(
              next,
              engine.form.getFieldValue(path),
              engine.form.getFieldsValue(true),
            );
          engine.change(path, next);
          original?.(...args);
        };
        const triggers = validateTrigger === false ? [] : [validateTrigger].flat();
        for (const name of triggers) {
          const originalValidate = bound[name] ?? only.props[name];
          bound[name] = (...args: any[]) => {
            originalValidate?.(...args);
            clearTimeout(timeout.current);
            if (validateDebounce)
              timeout.current = setTimeout(
                () => engine.validateTrigger(path, name),
                validateDebounce,
              );
            else engine.validateTrigger(path, name);
          };
        }
        const originalRef = only.props.ref;
        bound.ref = (node: any) => {
          engine.attach(path, node);
          const cleanup = typeof originalRef === 'function' ? originalRef(node) : undefined;
          if (originalRef && typeof originalRef !== 'function') originalRef.current = node;
          if (node)
            return () => {
              engine.attach(path, null);
              if (typeof cleanup === 'function') cleanup();
              else if (typeof originalRef === 'function') originalRef(null);
              else if (originalRef) originalRef.current = null;
            };
        };
      }
      if (status === 'error') bound['aria-invalid'] = true;
      if (help !== undefined || meta.errors.length || meta.warnings.length)
        bound['aria-describedby'] = [only.props['aria-describedby'], messageId]
          .filter(Boolean)
          .join(' ');
      const controlProps = { ...only.props };
      for (const propName of Object.keys(bound)) {
        if (
          propName !== 'key' &&
          propName !== '__self' &&
          propName !== '__source' &&
          (propName !== 'ref' || bound.ref !== undefined)
        )
          controlProps[propName] = bound[propName];
      }
      const controlKey = bound.key === undefined ? (only.key ?? undefined) : bound.key;
      const Control = only.type;
      content = <Control key={controlKey} {...controlProps} />;
    }
  }
  const isRequired =
    required ??
    rules?.some((rule) => (typeof rule === 'function' ? rule(engine.form) : rule).required);
  const marker = context.props.requiredMark;
  const labelContent =
    typeof marker === 'function' ? (
      marker(label, { required: !!isRequired })
    ) : (
      <>
        {label}
        {marker === 'optional'
          ? !isRequired && (
              <span className="text-foreground-description">({t('form.optional')})</span>
            )
          : isRequired &&
            marker !== false && (
              <span aria-hidden className="text-destructive-text">
                *
              </span>
            )}
      </>
    );
  const feedbackIcons =
    typeof hasFeedback === 'object' ? hasFeedback.icons : context.props.feedbackIcons;
  const defaultIcons: Partial<Record<Status, ReactNode>> = {
    error: <CircleAlert className="size-4 text-destructive-text" />,
    success: <Check className="size-4 text-success-text" />,
    validating: <Spinner className="size-4" />,
    warning: <TriangleAlert className="size-4 text-warning-text" />,
  };
  const icon =
    hasFeedback &&
    (feedbackIcons?.({ errors: meta.errors, status, warnings: meta.warnings }) ?? defaultIcons)[
      status
    ];
  const tooltipOptions =
    tooltip && typeof tooltip === 'object' && !isValidElement(tooltip) && 'title' in tooltip
      ? tooltip
      : undefined;
  const tooltipTitle = tooltipOptions ? tooltipOptions.title : (tooltip as ReactNode);
  const inner = (
    <StatusContext value={{ errors: meta.errors, status, warnings: meta.warnings }}>
      <NoStyleContext value={collectNoStyle}>
        <Fragment key={path ? engine.resetVersion(path) : undefined}>{content}</Fragment>
      </NoStyleContext>
    </StatusContext>
  );
  if (noStyle && !hidden) return inner;
  return (
    <Field
      data-invalid={status === 'error' || undefined}
      data-slot="form-item"
      orientation="vertical"
      style={style}
      className={clsx(
        cn('mb-6 min-w-0', hidden && 'hidden'),
        `${prefixCls}-item`,
        status && `${prefixCls}-item-has-${status}`,
        className,
        rootClassName,
      )}
    >
      <div
        className={clsx(
          cn(
            'flex min-w-0 gap-y-2',
            !labelCol && !wrapperCol && 'gap-x-2',
            layout === 'vertical' ? 'flex-col' : 'flex-row flex-wrap items-start',
          ),
          `${prefixCls}-item-row`,
        )}
      >
        {label !== undefined && label !== null && (
          <div
            {...columnDomProps(labelCol)}
            style={{ ...context.styles.label, ...columnStyle(labelCol) }}
            className={clsx(
              cn(
                'flex items-center gap-1 text-sm',
                labelAlign === 'right' && 'text-end',
                !labelWrap && 'shrink-0',
                columnClass(labelCol),
              ),
              `${prefixCls}-item-label`,
              context.classNames.label,
              labelCol?.className,
            )}
          >
            <FieldLabel className="text-sm leading-5.5" htmlFor={htmlFor ?? controlId}>
              {labelContent}
              {colon && layout !== 'vertical' ? ':' : null}
            </FieldLabel>
            {tooltipTitle && (
              <SimpleTooltip title={tooltipTitle}>
                {tooltipOptions?.icon ?? <Info className="size-4 text-foreground-description" />}
              </SimpleTooltip>
            )}
          </div>
        )}
        <div
          {...columnDomProps(wrapperCol)}
          style={{ ...context.styles.content, ...columnStyle(wrapperCol) }}
          className={clsx(
            cn('flex min-w-0 flex-1 flex-col gap-1', columnClass(wrapperCol)),
            `${prefixCls}-item-control`,
            context.classNames.content,
            wrapperCol?.className,
          )}
        >
          <div className={clsx('min-w-0', `${prefixCls}-item-control-input-content`)}>
            {inner}
            {icon}
          </div>
          <div id={messageId}>
            <ErrorList
              errors={meta.errors}
              help={help}
              helpStatus={status}
              warnings={meta.warnings}
            />
          </div>
          {extra !== undefined && (
            <div className="text-sm text-foreground-description">{extra}</div>
          )}
        </div>
      </div>
    </Field>
  );
}
const Item = Object.assign(FormItem, { useStatus: () => use(StatusContext) });

interface FormListProps {
  children: (
    fields: Array<{ key: number; name: number; fieldKey: number }>,
    operations: {
      add: (value?: any, index?: number) => void;
      remove: (index: number | number[]) => void;
      move: (from: number, to: number) => void;
    },
    meta: { errors: ReactNode[]; warnings: ReactNode[] },
  ) => ReactNode;
  initialValue?: any[];
  name: NamePath;
  prefixCls?: string;
  rules?: Rule[];
}
function FormList({ children, initialValue, name, rules }: FormListProps) {
  const { engine } = useContextForm();
  useVersion(engine);
  const prefix = use(ListContext);
  const path = [...prefix, ...toPath(name)];
  const pathKey = JSON.stringify(path);
  const currentPath = useRef(path);
  currentPath.current = path;
  const token = useSingleton(() => Symbol('list'));
  const configuration = useRef<FieldRegistration>({});
  configuration.current = { initialValue, isList: true, rules };
  useEffect(
    () => engine.register(currentPath.current, token, () => configuration.current),
    [engine, pathKey, token],
  );
  const value = engine.form.getFieldValue(path);
  const values: any[] = Array.isArray(value) ? value : (initialValue ?? []);
  const keys = useRef<{ id: number; items: number[]; reset: number }>({
    id: 0,
    items: [],
    reset: 0,
  });
  const reset = engine.resetVersion(path);
  if (keys.current.reset !== reset) {
    keys.current.items = [];
    keys.current.reset = reset;
  }
  while (keys.current.items.length < values.length) keys.current.items.push(keys.current.id++);
  keys.current.items.length = values.length;
  const publish = (next: any[]) => {
    engine.change(path, next);
    if (rules?.length) engine.validateTrigger(path, 'onChange');
  };
  const currentValues = (): any[] => {
    const current = engine.form.getFieldValue(path);
    return Array.isArray(current) ? current : [];
  };
  const operations = {
    add: (value?: any, index?: number) => {
      const current = currentValues();
      const position =
        index === undefined ? current.length : Math.max(0, Math.min(index, current.length));
      const next = [...current];
      next.splice(position, 0, value);
      keys.current.items.splice(position, 0, keys.current.id++);
      publish(next);
    },
    remove: (index: number | number[]) => {
      const indices = new Set([index].flat());
      keys.current.items = keys.current.items.filter((_, i) => !indices.has(i));
      publish(currentValues().filter((_, i) => !indices.has(i)));
    },
    move: (from: number, to: number) => {
      const current = currentValues();
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length)
        return;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      const [key] = keys.current.items.splice(from, 1);
      keys.current.items.splice(to, 0, key);
      publish(next);
    },
  };
  const meta = engine.meta(path);
  return (
    <ListContext value={path}>
      {children(
        values.map((_, name) => ({
          fieldKey: keys.current.items[name],
          key: keys.current.items[name],
          name,
        })),
        operations,
        meta,
      )}
    </ListContext>
  );
}

function FormProvider({
  children,
  onFormChange,
  onFormFinish,
  validateMessages,
}: {
  children?: ReactNode;
  onFormChange?: (
    name: string,
    info: { changedFields: FieldData[]; forms: Record<string, FormInstance> },
  ) => void;
  onFormFinish?: (name: string, info: { values: any; forms: Record<string, FormInstance> }) => void;
  validateMessages?: Record<string, any>;
}) {
  const parent = use(ProviderContext);
  const forms = useRef<Record<string, FormInstance>>({});
  return (
    <ProviderContext
      value={{
        validateMessages: mergeWith({}, parent?.validateMessages, validateMessages),
        change: (name, changedFields) => {
          onFormChange?.(name, { changedFields, forms: { ...forms.current } });
          parent?.change(name, changedFields);
        },
        finish: (name, values) => {
          onFormFinish?.(name, { forms: { ...forms.current }, values });
          parent?.finish(name, values);
        },
        register: (name, form) => {
          if (name) forms.current[name] = form;
          const unregister = parent?.register(name, form);
          return () => {
            if (forms.current[name] === form) delete forms.current[name];
            unregister?.();
          };
        },
      }}
    >
      {children}
    </ProviderContext>
  );
}

const isFormItemArray = (children: FormItemProps[] | ReactNode): children is FormItemProps[] =>
  Array.isArray(children) &&
  children.every(
    (child) =>
      child !== null && typeof child === 'object' && !isValidElement(child) && !('then' in child),
  );
interface FormGroupProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> {
  children?: FormItemProps[] | ReactNode;
  collapsible?: boolean;
  defaultActive?: boolean;
  desc?: ReactNode;
  extra?: ReactNode;
  gap?: number | string;
  icon?: LucideIcon;
  itemClassName?: string;
  itemMinWidth?: string | number;
  itemVariant?: FormVariant;
  styles?: { title?: CSSProperties };
  title?: ReactNode;
  variant?: FormVariant;
}
const FormGroupItems = ({
  items,
  itemClassName,
  itemMinWidth,
  itemVariant = 'borderless',
}: {
  items: FormItemProps[];
  itemClassName?: string;
  itemMinWidth?: string | number;
  itemVariant?: FormVariant;
}) => (
  <>
    {items.map((item, index) => {
      if (item.hidden) return null;
      const {
        avatar,
        children,
        desc,
        divider,
        hidden: _hidden,
        label,
        minWidth,
        tag,
        variant,
        ...binding
      } = item;
      const hasBinding = 'name' in binding || 'valuePropName' in binding;
      return (
        <div
          className={clsx('flex flex-col', variantClassName[variant ?? itemVariant])}
          data-slot="form-item"
          key={binding.name === undefined ? index : JSON.stringify(binding.name)}
        >
          <div className="flex min-h-11 flex-row items-center justify-between gap-4 py-2">
            <div
              className="flex min-w-0 flex-col gap-0.5"
              style={
                (minWidth ?? itemMinWidth) !== undefined
                  ? { minWidth: minWidth ?? itemMinWidth }
                  : undefined
              }
            >
              <div className="flex flex-row items-center gap-2">
                {avatar}
                <span className="text-sm font-medium">{label}</span>
                {tag}
              </div>
              {desc ? <div className="text-sm text-foreground-description">{desc}</div> : null}
            </div>
            {hasBinding || typeof children === 'function' ? (
              <Item className={clsx('mb-0', itemClassName)} {...binding}>
                {children}
              </Item>
            ) : (
              children
            )}
          </div>
          {divider ? <Separator /> : null}
        </div>
      );
    })}
  </>
);

export const FormGroup = ({
  children,
  className,
  collapsible: _collapsible,
  defaultActive: _defaultActive,
  desc,
  extra,
  gap = 16,
  icon,
  itemClassName,
  itemMinWidth,
  itemVariant = 'borderless',
  style,
  styles,
  title,
  variant = 'borderless',
  ...rest
}: FormGroupProps) => (
  <section
    className={clsx('flex flex-col', gapClass(gap), className)}
    style={{ ...gapStyle(gap), ...style }}
    {...rest}
  >
    {title || extra ? (
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="flex min-w-0 flex-row items-center gap-2">
          {icon ? createElement(icon, { size: 16 }) : null}
          <span className="font-semibold" style={styles?.title}>
            {title}
          </span>
        </div>
        {extra}
      </div>
    ) : null}
    {desc ? <div className="text-sm text-foreground-description">{desc}</div> : null}
    <div
      className={clsx(
        'flex flex-col gap-2',
        variantClassName[variant],
        variant !== 'borderless' && 'p-4',
      )}
    >
      {isFormItemArray(children) ? (
        <FormGroupItems
          itemClassName={itemClassName}
          itemMinWidth={itemMinWidth}
          itemVariant={itemVariant}
          items={children}
        />
      ) : (
        children
      )}
    </div>
  </section>
);

function FormBase(props: FormProps) {
  const {
    children,
    className,
    classNames,
    clearOnDestroy,
    collapsible,
    colon: _colon,
    component = 'form',
    defaultActive,
    disabled: _disabled,
    feedbackIcons: _feedbackIcons,
    fields,
    footer,
    form: provided,
    gap = 24,
    initialValues,
    itemMinWidth,
    items,
    itemsType = 'flat',
    itemVariant,
    labelAlign: _labelAlign,
    labelCol: _labelCol,
    labelWrap: _labelWrap,
    layout = 'horizontal',
    name,
    onFieldsChange,
    onFinish,
    onFinishFailed,
    onReset,
    onSubmit,
    onValuesChange,
    prefixCls,
    preserve = true,
    ref,
    requiredMark: _requiredMark,
    rootClassName,
    scrollToFirstError,
    size: _size,
    styles,
    tooltip: _tooltip,
    validateMessages,
    validateTrigger: _validateTrigger,
    variant = 'borderless',
    wrapperCol: _wrapperCol,
    ...native
  } = props;
  const [form] = useForm(provided);
  const engine = engineOf(form);
  const provider = use(ProviderContext);
  const { t } = useTranslation('ui');
  const inheritedControl = useFormControlContext();
  const disabled = _disabled ?? inheritedControl.disabled;
  const size = _size ?? inheritedControl.size;
  const resolvedProps = { ...props, disabled, layout, size };
  const resolvedClasses =
    typeof classNames === 'function' ? classNames({ props: resolvedProps }) : (classNames ?? {});
  const resolvedStyles =
    typeof styles === 'function' ? styles({ props: resolvedProps }) : (styles ?? {});
  engine.initialize(initialValues);
  engine.configure(
    {
      onFieldsChange,
      onFinish,
      onFinishFailed: (error) => {
        onFinishFailed?.(error);
        if (scrollToFirstError && error.errorFields[0])
          form.scrollToField(
            error.errorFields[0].name,
            typeof scrollToFirstError === 'boolean' ? { block: 'nearest' } : scrollToFirstError,
          );
      },
      onValuesChange,
      providerChange: (changed) => provider?.change(name ?? '', changed),
      providerFinish: (values) => provider?.finish(name ?? '', values),
    },
    {
      invalid: (label) => t('form.validation.invalid', { label }),
      required: (label) => t('form.validation.required', { label }),
    },
    mergeWith({}, provider?.validateMessages, validateMessages),
    preserve,
  );
  const root = useRef<HTMLElement | null>(null);
  useImperativeHandle(ref, () => Object.assign({}, form, { nativeElement: root.current }), [form]);
  useEffect(() => provider?.register(name ?? '', form), [form, name, provider]);
  useEffect(() => {
    if (fields) form.setFields(fields);
  }, [form, fields]);
  useEffect(
    () => () => {
      if (clearOnDestroy) engine.clear();
    },
    [engine, clearOnDestroy],
  );
  const content = (
    <FormContext
      value={{ classNames: resolvedClasses, engine, props: resolvedProps, styles: resolvedStyles }}
    >
      <div className={clsx('flex flex-col', gapClass(gap))} style={gapStyle(gap)}>
        {itemsType === 'group'
          ? (items as FormGroupItemType[] | undefined)?.map((group, index) => (
              <FormGroup
                collapsible={group.collapsible ?? collapsible}
                defaultActive={group.defaultActive ?? defaultActive}
                desc={group.desc}
                extra={group.extra}
                icon={group.icon}
                itemClassName={resolvedClasses.item}
                itemMinWidth={itemMinWidth}
                itemVariant={itemVariant}
                key={group.key ?? index}
                title={group.title}
                variant={group.variant ?? variant}
              >
                {group.children}
              </FormGroup>
            ))
          : items && (
              <div
                className={clsx(
                  'flex flex-col',
                  variantClassName[variant],
                  variant !== 'borderless' && 'p-4',
                )}
              >
                <FormGroupItems
                  itemClassName={resolvedClasses.item}
                  itemMinWidth={itemMinWidth}
                  itemVariant={itemVariant}
                  items={items as FormItemProps[]}
                />
              </div>
            )}
        {typeof children === 'function' ? <FormRender>{children}</FormRender> : children}
      </div>
      {footer}
    </FormContext>
  );
  const formElement =
    component === false
      ? content
      : createElement(
          component,
          {
            ...native,
            className: clsx(
              'text-sm text-foreground',
              prefixCls ?? 'ant-form',
              `${prefixCls ?? 'ant-form'}-${layout}`,
              resolvedClasses.root,
              className,
              rootClassName,
            ),
            name,
            ref: root,
            style: { ...resolvedStyles.root, ...native.style },
            onReset: (event: React.FormEvent<HTMLFormElement>) => {
              onReset?.(event);
              if (!event.defaultPrevented) {
                event.preventDefault();
                form.resetFields();
              }
            },
            onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
              onSubmit?.(event);
              if (!event.defaultPrevented) {
                event.preventDefault();
                form.submit();
              }
            },
          },
          content,
        );
  return (
    <FormControlProvider disabled={disabled} size={size}>
      {formElement}
    </FormControlProvider>
  );
}
function FormRender({ children }: { children: (values: any, form: FormInstance) => ReactNode }) {
  const { engine } = useContextForm();
  useVersion(engine);
  return children(engine.form.getFieldsValue(true), engine.form);
}

interface FormSubmitFooterTexts {
  reset?: string;
  submit?: string;
  unSaved?: string;
  unSavedWarning?: string;
}
export interface FormSubmitFooterProps {
  buttonProps?: ComponentProps<typeof Button>;
  children?: ReactNode;
  className?: string;
  enableReset?: boolean;
  enableUnsavedWarning?: boolean;
  float?: boolean;
  onReset?: (value: unknown, preValue: unknown) => void;
  resetButtonProps?: ComponentProps<typeof Button>;
  saveButtonProps?: ComponentProps<typeof Button>;
  texts?: FormSubmitFooterTexts;
}
const removeUndefined = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined).filter((item) => item !== undefined) as T;
  return Object.fromEntries(
    Object.entries(obj)
      .map(([key, value]) => [key, removeUndefined(value)])
      .filter(([, value]) => value !== undefined),
  ) as T;
};
const deepMerge = <T,>(target: T, source: T): T =>
  mergeWith({}, target, source, (obj: unknown, src: unknown) =>
    Array.isArray(obj) ? src : undefined,
  ) as T;
function FormSubmitFooter({
  buttonProps,
  children,
  className,
  enableReset = true,
  enableUnsavedWarning,
  float,
  onReset,
  resetButtonProps,
  saveButtonProps,
  texts,
  ...rest
}: FormSubmitFooterProps) {
  const disabled = useContextForm().props.disabled;
  const form = useFormInstance();
  const initialV = useSingleton(
    () => removeUndefined(form.getFieldsValue(true)) as Record<string, unknown>,
  );
  const { t } = useTranslation(['ui', 'common']);
  const values = useWatch([], form);
  const v = removeUndefined(values ?? {});
  const hasUnsavedChanges = !isEqual(deepMerge(initialV, v), initialV);
  const unsavedWarningText = texts?.unSavedWarning ?? t('form.unsavedWarning', { ns: 'ui' });
  useEffect(() => {
    if (!enableUnsavedWarning || typeof window === 'undefined' || !hasUnsavedChanges) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.returnValue = unsavedWarningText;
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [enableUnsavedWarning, hasUnsavedChanges, unsavedWarningText]);
  return (
    <div className={clsx('flex items-center justify-end gap-2', className)} {...rest}>
      {(float || hasUnsavedChanges) && (
        <>
          <Info className="ms-2 size-3 text-foreground-description" />
          <span
            className={cn('flex-none text-xs text-foreground-description', float ? 'me-4' : 'me-1')}
          >
            {texts?.unSaved ?? t('form.unsavedChanges', { ns: 'ui' })}
          </span>
        </>
      )}
      {children}
      {enableReset && (float || hasUnsavedChanges) && (
        <Button
          disabled={disabled}
          type="button"
          variant="secondary"
          onClick={() => {
            onReset?.(v, initialV);
            form.resetFields();
          }}
          {...buttonProps}
          {...resetButtonProps}
        >
          {texts?.reset ?? t('reset', { ns: 'common' })}
        </Button>
      )}
      <Button disabled={disabled} type="submit" {...buttonProps} {...saveButtonProps}>
        {texts?.submit ?? t('form.submit', { ns: 'ui' })}
      </Button>
    </div>
  );
}

export default Object.assign(FormBase, {
  ErrorList,
  Group: FormGroup,
  Item,
  List: FormList,
  Provider: FormProvider,
  SubmitFooter: FormSubmitFooter,
  useForm,
  useFormInstance,
  useWatch,
});
