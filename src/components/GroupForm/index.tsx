'use client';

import { Text } from '@lobehub/ui/base-ui';
import {
  Form as AntdForm,
  type FormItemProps as AntdFormItemProps,
  type FormProps as AntdFormProps,
} from 'antd';
import { cx } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import { createElement, type CSSProperties, memo, type ReactNode } from 'react';

import { Separator } from '@/components/ui/separator';

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
