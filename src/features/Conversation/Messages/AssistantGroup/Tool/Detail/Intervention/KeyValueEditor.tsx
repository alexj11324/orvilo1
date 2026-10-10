import { cn } from 'cn';
import { LucidePlus, LucideTrash } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Form from '@/components/GroupForm';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const styles = {
  form: 'relative w-full min-w-0 max-w-160 rounded-(--radius-card) p-2 text-sm leading-5.5',
  input: 'font-mono text-sm leading-5.5',
  row: 'relative',
  title: 'mb-1 text-sm leading-5.5 text-foreground-tertiary',
};

interface KeyValueItem {
  id: string;
  key?: string;
  value?: string;
}

interface KeyValueEditorProps {
  initialValue?: Record<string, any>;
  onCancel?: () => void;
  onFinish?: (value: Record<string, any>) => Promise<void>;
}

const recordToFormList = (record: Record<string, any>): KeyValueItem[] =>
  Object.entries(record)
    .map(([key, val], index) => ({
      id: `${key}-${index}`,
      key,
      value: typeof val === 'string' ? val : JSON.stringify(val),
    }))
    .filter((item) => item.key);

const formListToRecord = (list: KeyValueItem[]): Record<string, any> => {
  const record: Record<string, any> = {};
  list.forEach((item) => {
    if (item.key) {
      try {
        record[item.key] = JSON.parse(item.value || '""');
      } catch {
        record[item.key] = item.value || '';
      }
    }
  });
  return record;
};

const KeyValueEditor = memo<KeyValueEditorProps>(({ initialValue = {}, onFinish, onCancel }) => {
  const { t } = useTranslation(['tool', 'common']);
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ items: recordToFormList(initialValue) });
  }, [initialValue, form]);

  const [updating, setUpdating] = useState(false);
  const handleFinish = async () => {
    setUpdating(true);
    try {
      await form.validateFields();
      const values = form.getFieldsValue();
      const record = formListToRecord(values.items || []);
      await onFinish?.(record);
    } catch (errorInfo) {
      console.error('Validation Failed:', errorInfo);
      toast.error(t('updateArgs.formValidationFailed') || 'Please check the form for errors.');
    }
    setUpdating(false);
  };

  const handleCancel = () => {
    onCancel?.();
  };

  const validateKeys = (_: any, item: KeyValueItem, items: KeyValueItem[]) => {
    if (!item?.key) {
      return Promise.resolve();
    }
    const keys = items.map((i) => i?.key).filter(Boolean);
    if (keys.filter((k) => k === item.key).length > 1) {
      return Promise.reject(new Error(t('updateArgs.duplicateKeyError')));
    }

    return Promise.resolve();
  };

  return (
    <Form
      autoComplete="off"
      className={styles.form}
      form={form}
      initialValues={{ items: recordToFormList(initialValue) }}
    >
      <div className={cn('flex gap-2', styles.title)}>
        <div className="flex flex-col flex-1">key</div>
        <div className="flex flex-4 flex-col">value</div>
      </div>
      <Form.List name="items">
        {(fields, { add, remove }) => (
          <div className="flex w-full flex-col">
            {fields.map(({ key, name, ...restField }, index) => (
              <div className={cn('flex w-full items-start gap-2', styles.row)} key={key}>
                <Form.Item
                  {...restField}
                  className="flex-1"
                  name={[name, 'key']}
                  validateTrigger={['onChange', 'onBlur']}
                  rules={[
                    { message: t('updateArgs.keyRequired'), required: true },
                    {
                      validator: (rule) =>
                        validateKeys(
                          rule,
                          form.getFieldValue(['items', index]),
                          form.getFieldValue('items'),
                        ),
                    },
                  ]}
                >
                  <Input
                    className={styles.input}
                    placeholder={t('updateArgs.form.key')}
                    visualSize="normal"
                  />
                </Form.Item>
                <Form.Item {...restField} className="flex-4" name={[name, 'value']}>
                  <Input
                    className={styles.input}
                    placeholder={t('updateArgs.form.value')}
                    visualSize="normal"
                  />
                </Form.Item>
                <ActionIcon
                  icon={LucideTrash}
                  size={{ blockSize: 36, borderRadius: 'var(--radius-button)', size: 20 }}
                  title={t('delete', { ns: 'common' })}
                  onClick={() => remove(name)}
                />
              </div>
            ))}
            <Form.Item className="mt-2">
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  className="leading-5.5"
                  size="lg"
                  variant="secondary"
                  onClick={() => add({ id: `new-${Date.now()}`, key: '', value: '' })}
                >
                  <LucidePlus /> {t('updateArgs.form.add')}
                </Button>

                <div className="flex gap-2">
                  <Button className="leading-5.5" size="lg" onClick={handleCancel}>
                    {t('cancel', { ns: 'common' })}
                  </Button>
                  <Button
                    className="leading-5.5"
                    loading={updating}
                    size="lg"
                    variant="default"
                    onClick={handleFinish}
                  >
                    {t('save', { ns: 'common' })}
                  </Button>
                </div>
              </div>
            </Form.Item>
          </div>
        )}
      </Form.List>
    </Form>
  );
});

export default KeyValueEditor;
