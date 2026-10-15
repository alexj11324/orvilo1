import { Markdown } from '@lobehub/ui';
import * as m from 'motion/react-m';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import Form from '@/components/GroupForm';
import ItemRender from '@/components/JSONSchemaConfig/ItemRender';
import { Button } from '@/components/ui/button';
import { transformPluginSettings } from '@/features/PluginSettings';
import { useToolStore } from '@/store/tool';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

interface MCPConfigFormProps {
  configSchema: any;
  identifier: string;
  onCancel?: () => void;
  onSubmit?: (config: Record<string, any>) => Promise<void>;
}

const MCPConfigForm = memo<MCPConfigFormProps>(({ configSchema, identifier, onCancel }) => {
  const { t } = useTranslation(['plugin', 'common']);
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const motionDisabled = animationMode === 'disabled' || prefersReducedMotion;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const { installMCPPlugin } = useToolStore();

  const items = transformPluginSettings(configSchema);

  const handleSubmit = async (values: Record<string, any>) => {
    setLoading(true);
    try {
      await installMCPPlugin(identifier, { config: values, resume: true });
    } catch (error) {
      console.error('Config submission failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      // Default behavior: clear installation progress
      useToolStore.getState().updateMCPInstallProgress(identifier, undefined);
    }
  };

  return (
    <m.div
      animate={motionDisabled ? { y: [0, 0] } : { y: 0 }}
      className="mbs-2 w-full max-w-160 rounded-(--radius-card) border border-border bg-card p-4 text-sm leading-5.5"
      initial={motionDisabled ? false : { y: 8 }}
      transition={
        motionDisabled ? { duration: 0 } : { delay: 0.1, duration: 0.2, ease: [0.4, 0, 0.2, 1] }
      }
    >
      <m.div
        animate={motionDisabled ? { opacity: [1, 1], y: [0, 0] } : { opacity: 1, y: 0 }}
        initial={motionDisabled ? false : { opacity: 0, y: 4 }}
        transition={motionDisabled ? { duration: 0 } : { delay: 0.15, duration: 0.2 }}
      >
        <div className="flex flex-col gap-2">
          <strong className="text-sm leading-5.5 font-semibold">
            {t('mcpInstall.configurationRequired')}
          </strong>
          <span className="text-sm leading-5.5 text-muted-foreground">
            {t('mcpInstall.configurationDescription')}
          </span>
        </div>
      </m.div>

      <m.div
        animate={motionDisabled ? { opacity: [1, 1], y: [0, 0] } : { opacity: 1, y: 0 }}
        initial={motionDisabled ? false : { opacity: 0, y: 4 }}
        transition={motionDisabled ? { duration: 0 } : { delay: 0.2, duration: 0.2 }}
      >
        <Form
          form={form}
          gap={12}
          itemsType={'flat'}
          layout={'vertical'}
          variant={'borderless'}
          items={items
            .filter((item) => configSchema.required?.includes(item.name))
            .map((item) => ({
              children: (
                <ItemRender
                  enum={item.enum}
                  format={item.format}
                  maximum={item.maximum}
                  minimum={item.minimum}
                  type={item.type as any}
                />
              ),
              desc: item.desc && (
                <Markdown
                  className="[&_p]:text-foreground-description"
                  fontSize={14}
                  lineHeight={22 / 14}
                  variant={'chat'}
                >
                  {item.desc as string}
                </Markdown>
              ),
              key: item.label,
              label: item.label,
              name: item.name,
              rules: [{ required: true }],
              tag: item.tag,
              valuePropName: item.type === 'boolean' ? 'checked' : undefined,
            }))}
          onFinish={handleSubmit}
        />
      </m.div>

      <m.div
        animate={motionDisabled ? { opacity: [1, 1], y: [0, 0] } : { opacity: 1, y: 0 }}
        className="mbs-4 flex flex-wrap justify-end gap-2 [border-block-start:1px_solid_var(--divider)] pbs-2"
        initial={motionDisabled ? false : { opacity: 0, y: 4 }}
        transition={motionDisabled ? { duration: 0 } : { delay: 0.25, duration: 0.2 }}
      >
        <Button size="lg" onClick={handleCancel}>
          {t('common:cancel')}
        </Button>
        <Button loading={loading} size="lg" variant="default" onClick={() => form.submit()}>
          {t('mcpInstall.continueInstall')}
        </Button>
      </m.div>
    </m.div>
  );
});

export default MCPConfigForm;
