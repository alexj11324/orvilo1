import { PreviewCard } from '@base-ui/react/preview-card';
import { ActionIcon } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { XIcon } from 'lucide-react';
import { type CSSProperties, type FC, type ReactNode } from 'react';

const styles = createStaticStyles(({ css }) => {
  return {
    close: css`
      color: white;
    `,
    container: css`
      position: relative;
    `,
    footer: css`
      display: flex;
      justify-content: end;
      width: 100%;
    `,
    overlay: css`
      .ant-popover-inner {
        border: none;
      }
    `,
    tip: css`
      position: absolute;
      inset-inline-start: 50%;
      transform: translate(-50%);
    `,
  };
});

export interface TipGuideProps {
  /**
   * Guide content
   */
  children?: ReactNode;
  /**
   * Class name
   */
  className?: string;
  /**
   * Default open state
   */
  defaultOpen?: boolean;
  /**
   * Render function for customizing the footer section
   */
  footerRender?: (dom: ReactNode) => ReactNode;
  /**
   * Maximum width
   */
  maxWidth?: number;
  /**
   * Vertical offset value
   */
  offsetY?: number;
  /**
   * Callback triggered when the open property changes
   */
  onOpenChange: (open: boolean) => void;
  /**
   * Controlled open property
   */
  open?: boolean;
  /**
   * Tooltip placement, defaults to bottom
   */
  placement?: 'bottom' | 'left' | 'right' | 'top';
  /**
   * style
   */
  style?: CSSProperties;
  tip?: boolean;
  /**
   * Guide title
   */
  title: string;
}

const TipGuide: FC<TipGuideProps> = ({
  children,
  placement = 'bottom',
  title,
  offsetY,
  maxWidth = 300,
  className,
  style,
  open,
  onOpenChange: setOpen,
}) => {
  return open ? (
    <div className={cx(styles.container, className)} style={style}>
      <div
        style={{
          marginTop: offsetY,
        }}
      >
        <PreviewCard.Root defaultOpen={open} open={open} onOpenChange={setOpen}>
          <PreviewCard.Trigger render={<span />}>{children}</PreviewCard.Trigger>
          <PreviewCard.Portal>
            <PreviewCard.Positioner side={placement} sideOffset={4}>
              <PreviewCard.Popup
                className={styles.overlay}
                style={{ maxWidth, userSelect: 'none', zIndex: 1000 }}
              >
                <div className={'flex gap-6'}>
                  <div>{title}</div>
                  <ActionIcon
                    className={styles.close}
                    icon={XIcon}
                    size={'small'}
                    onClick={() => {
                      setOpen(false);
                    }}
                  />
                </div>
              </PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      </div>
    </div>
  ) : (
    children
  );
};

export default TipGuide;
