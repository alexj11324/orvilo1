'use client';

import { cn } from 'cn';
import { Fragment, type ReactNode } from 'react';

import Form, { type FormItemProps } from '@/components/GroupForm';
import { Frame, FramePanel } from '@/components/reui/frame';

interface FieldRowProps {
  children?: ReactNode;
  className?: string;
  desc?: ReactNode;
  /** Full-width content under the label and control, e.g. an error detail. */
  footer?: ReactNode;
  label?: ReactNode;
}

/**
 * One settings row inside a panel: label and description on the left, control
 * on the right (stacked on narrow widths). Matches the mockup `.field`.
 */
export const FieldRow = ({ children, className, desc, footer, label }: FieldRowProps) => (
  <div
    data-slot="provider-field"
    className={cn(
      'grid min-h-15 grid-cols-[minmax(0,1fr)_minmax(240px,44%)] items-center gap-x-6 gap-y-2 border-t border-border px-4 py-3 first:border-t-0 max-sm:grid-cols-1',
      className,
    )}
  >
    <div className="flex min-w-0 flex-col">
      <div className="font-medium">{label}</div>
      {desc ? <div className="text-xs leading-[18px] text-muted-foreground">{desc}</div> : null}
    </div>
    <div className="flex min-w-0 items-center justify-end gap-2 max-sm:justify-start [&_.ant-form-item]:min-w-0 [&_.ant-form-item]:flex-1 [&_.ant-form-item-control-input-content]:flex [&_.ant-form-item-control-input-content]:justify-end [&_[data-slot=input]]:h-9">
      {children}
    </div>
    {footer ? <div className="col-span-full min-w-0">{footer}</div> : null}
  </div>
);

export type CredentialItem = FormItemProps | { node: ReactNode };

const isNode = (item: CredentialItem): item is { node: ReactNode } => 'node' in item;

interface CredentialsPanelProps {
  items: CredentialItem[];
}

/**
 * The "Credentials" panel of a provider: a bordered frame of field rows. Rows
 * bind to the surrounding antd form through `Form.Item` exactly like
 * `GroupForm` does, so every `FormItemProps` a provider page supplies (name,
 * rules, valuePropName, ...) keeps working.
 */
const CredentialsPanel = ({ items }: CredentialsPanelProps) => (
  <Frame dense className="[--frame-radius:var(--radius-card)]">
    <FramePanel className="p-0">
      {items.map((item, index) => {
        if (isNode(item)) return <Fragment key={`node-${index}`}>{item.node}</Fragment>;
        if (item.hidden) return null;

        const {
          avatar,
          children,
          desc,
          divider: _divider,
          hidden: _hidden,
          label,
          minWidth: _minWidth,
          tag,
          variant: _variant,
          ...binding
        } = item;
        const hasBinding = 'name' in binding || 'valuePropName' in binding;

        return (
          <FieldRow
            desc={desc}
            key={String(binding.name ?? index)}
            label={
              avatar || tag ? (
                <span className="flex items-center gap-2">
                  {avatar}
                  {label}
                  {tag}
                </span>
              ) : (
                label
              )
            }
          >
            {hasBinding || typeof children === 'function' ? (
              <Form.Item style={{ marginBottom: 0 }} {...binding}>
                {children}
              </Form.Item>
            ) : (
              children
            )}
          </FieldRow>
        );
      })}
    </FramePanel>
  </Frame>
);

export default CredentialsPanel;
