'use client';

import { Button, type ButtonProps, Text } from '@lobehub/ui/base-ui';
import {
  Form as AntdForm,
  type FormItemProps as AntdFormItemProps,
  type FormProps as AntdFormProps,
} from 'antd';
import { cssVar, cx } from 'antd-style';
import { mergeWith } from 'es-toolkit/compat';
import isEqual from 'fast-deep-equal';
import { Info, type LucideIcon } from 'lucide-react';
import { createElement, type CSSProperties, memo, type ReactNode, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Separator } from '@/components/ui/separator';
import { useSingleton } from '@/hooks/useSingleton';

type FormVariant = 'borderless' | 'filled' | 'outlined';

export interface FormItemProps extends Omit<AntdFormItemProps, 'label'> {
  avatar?: ReactNode;
  desc?: ReactNode;
  divider?: boolean;
  hidden?: boolean;
  label?: ReactNode;
  minWidth?: string | number;
  tag?: ReactNode;
  variant?: FormVariant;
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

const variantClassName: Record<FormVariant, string> = {
  borderless: '',
  filled: 'bg-secondary rounded-2xl',
  outlined: 'border border-border rounded-2xl',
};

interface FormGroupProps extends React.HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultActive?: boolean;
  desc?: ReactNode;
  extra?: ReactNode;
  gap?: number | string;
  icon?: LucideIcon;
  itemMinWidth?: string | number;
  itemVariant?: FormVariant;
  style?: CSSProperties;
  title?: ReactNode;
  variant?: FormVariant;
}

const FormGroupItems = ({
  items,
  itemMinWidth,
  itemVariant = 'borderless',
}: {
  itemMinWidth?: string | number;
  itemVariant?: FormVariant;
  items: FormItemProps[];
}) => (
  <>
    {items.map((item, index) => {
      if (item.hidden) return null;
      const {
        avatar,
        desc,
        divider,
        hidden: _hidden,
        label,
        minWidth,
        tag,
        variant,
        children,
        ...binding
      } = item;
      const hasBinding = 'name' in binding || 'valuePropName' in binding;
      return (
        <div
          className={cx('flex flex-col', variantClassName[variant ?? itemVariant])}
          data-slot="form-item"
          key={binding.name ?? index}
        >
          <div
            className="flex flex-row items-center justify-between gap-4 py-2"
            style={{ minHeight: 44 }}
          >
            <div
              className="flex flex-col gap-0.5 min-w-0"
              style={{ minWidth: minWidth ?? itemMinWidth }}
            >
              <div className="flex flex-row items-center gap-2">
                {avatar}
                <Text as={'span'} weight={500}>
                  {label}
                </Text>
                {tag}
              </div>
              {desc ? (
                <Text fontSize={12} type={'secondary'}>
                  {desc}
                </Text>
              ) : null}
            </div>
            {hasBinding ? (
              <AntdForm.Item style={{ marginBottom: 0 }} {...binding}>
                {children}
              </AntdForm.Item>
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

export const FormGroup = memo<FormGroupProps>(
  ({
    children,
    className,
    collapsible: _collapsible,
    defaultActive: _defaultActive,
    desc,
    extra,
    gap = 16,
    icon,
    itemMinWidth,
    itemVariant = 'borderless',
    style,
    title,
    variant = 'borderless',
    ...rest
  }) => (
    <section
      className={cx('flex flex-col', className)}
      style={{ gap: typeof gap === 'number' ? gap : gap, ...style }}
      {...rest}
    >
      {title || extra ? (
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-row items-center gap-2 min-w-0">
            {icon ? createElement(icon, { size: 18 }) : null}
            <Text strong as={'span'}>
              {title}
            </Text>
          </div>
          {extra}
        </div>
      ) : null}
      {desc ? <Text type={'secondary'}>{desc}</Text> : null}
      <div
        className={cx(
          'flex flex-col gap-2',
          variantClassName[variant],
          variant !== 'borderless' && 'p-4',
        )}
      >
        {Array.isArray(children) ? (
          <FormGroupItems
            itemMinWidth={itemMinWidth}
            itemVariant={itemVariant}
            items={children as FormItemProps[]}
          />
        ) : (
          children
        )}
      </div>
    </section>
  ),
);

FormGroup.displayName = 'FormGroup';

export interface FormProps extends Omit<AntdFormProps, 'children'> {
  children?: ReactNode;
  collapsible?: boolean;
  defaultActive?: boolean;
  footer?: ReactNode;
  gap?: number | string;
  itemMinWidth?: string | number;
  items?: FormGroupItemType[] | FormItemProps[];
  itemsType?: 'flat' | 'group';
  itemVariant?: FormVariant;
  variant?: FormVariant;
}

const FormBase = memo<FormProps>(
  ({
    children,
    collapsible,
    defaultActive,
    footer,
    gap = 24,
    itemMinWidth,
    items,
    itemsType = 'flat',
    itemVariant,
    variant = 'borderless',
    ...rest
  }) => (
    <AntdForm {...rest}>
      <div className="flex flex-col" style={{ gap }}>
        {itemsType === 'group'
          ? (items as FormGroupItemType[] | undefined)?.map((group, index) => {
              const groupVariant = group.variant ?? variant;
              return (
                <FormGroup
                  collapsible={group.collapsible ?? collapsible}
                  defaultActive={group.defaultActive ?? defaultActive}
                  desc={group.desc}
                  extra={group.extra}
                  icon={group.icon}
                  itemMinWidth={itemMinWidth}
                  itemVariant={itemVariant}
                  key={group.key ?? index}
                  title={group.title}
                  variant={groupVariant}
                >
                  {group.children}
                </FormGroup>
              );
            })
          : (items as FormItemProps[] | undefined) && (
              <div
                className={cx(
                  'flex flex-col',
                  variantClassName[variant],
                  variant !== 'borderless' && 'p-4',
                )}
              >
                <FormGroupItems
                  itemMinWidth={itemMinWidth}
                  itemVariant={itemVariant}
                  items={items as FormItemProps[]}
                />
              </div>
            )}
        {children}
      </div>
      {footer}
    </AntdForm>
  ),
);

FormBase.displayName = 'Form';

const Form = Object.assign(FormBase, {
  ErrorList: AntdForm.ErrorList,
  Group: FormGroup,
  Item: AntdForm.Item,
  List: AntdForm.List,
  Provider: AntdForm.Provider,
  useForm: AntdForm.useForm,
  useFormInstance: AntdForm.useFormInstance,
  useWatch: AntdForm.useWatch,
});

export default Form;

interface FormSubmitFooterTexts {
  reset?: string;
  submit?: string;
  unSaved?: string;
  unSavedWarning?: string;
}

export interface FormSubmitFooterProps {
  buttonProps?: ButtonProps;
  children?: ReactNode;
  className?: string;
  enableReset?: boolean;
  enableUnsavedWarning?: boolean;
  float?: boolean;
  onReset?: (value: unknown, preValue: unknown) => void;
  resetButtonProps?: ButtonProps;
  saveButtonProps?: ButtonProps;
  texts?: FormSubmitFooterTexts;
}

const removeUndefined = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj))
    return obj.map((item) => removeUndefined(item)).filter((item) => item !== undefined) as T;
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    const v = removeUndefined(value);
    if (v !== undefined) result[key] = v;
  }
  return result as T;
};

const deepMerge = <T,>(target: T, source: T): T =>
  mergeWith({}, target, source, (obj: unknown, src: unknown) =>
    Array.isArray(obj) ? src : undefined,
  ) as T;

const FormSubmitFooter = memo<FormSubmitFooterProps>(
  ({
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
  }) => {
    const form = AntdForm.useFormInstance();
    const initialV = useSingleton(
      () => removeUndefined(form.getFieldsValue(true)) as Record<string, unknown>,
    );
    const { t } = useTranslation(['ui', 'common']);
    const values = AntdForm.useWatch([], form) as Record<string, unknown> | undefined;

    const v = useMemo(() => removeUndefined(values ?? {}), [values]);
    const mergedV = useMemo(() => deepMerge(initialV, v), [v, initialV]);
    const hasUnsavedChanges = !isEqual(mergedV, initialV);

    const unsavedWarningText = texts?.unSavedWarning ?? t('form.unsavedWarning', { ns: 'ui' });
    const unsavedText = texts?.unSaved ?? t('form.unsavedChanges', { ns: 'ui' });
    const resetText = texts?.reset ?? t('reset', { ns: 'common' });
    const submitText = texts?.submit ?? t('form.submit', { ns: 'ui' });

    useEffect(() => {
      if (!enableUnsavedWarning || typeof window === 'undefined' || !hasUnsavedChanges) return;
      const fn = (e: BeforeUnloadEvent) => {
        e.returnValue = unsavedWarningText;
      };
      window.addEventListener('beforeunload', fn);
      return () => window.removeEventListener('beforeunload', fn);
    }, [enableUnsavedWarning, hasUnsavedChanges, unsavedWarningText]);

    return (
      <div className={cx('flex items-center justify-end gap-2', className)} {...rest}>
        {(float || hasUnsavedChanges) && (
          <>
            <Info size={12} style={{ color: cssVar.colorTextDescription, marginLeft: 8 }} />
            <span
              style={{
                color: cssVar.colorTextDescription,
                flex: 'none',
                fontSize: 12,
                marginRight: float ? 16 : 4,
              }}
            >
              {unsavedText}
            </span>
          </>
        )}
        {children}
        {enableReset && (float || hasUnsavedChanges) && (
          <Button
            htmlType="button"
            variant="filled"
            onClick={() => {
              onReset?.(v, initialV);
              form.resetFields();
            }}
            {...buttonProps}
            {...resetButtonProps}
          >
            {resetText}
          </Button>
        )}
        <Button htmlType="submit" type="primary" {...buttonProps} {...saveButtonProps}>
          {submitText}
        </Button>
      </div>
    );
  },
);

FormSubmitFooter.displayName = 'FormSubmitFooter';
