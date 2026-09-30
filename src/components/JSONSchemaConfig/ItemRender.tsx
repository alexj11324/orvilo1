import { Select, Slider, Switch } from '@lobehub/ui/base-ui';
import { type JSONSchema7Type } from 'json-schema';
import { memo } from 'react';

import { NumberField } from '@/components/reui/number-field';
import { Input } from '@/components/ui/input';

interface JSONSchemaItemRenderProps {
  defaultValue?: any;
  enum?: JSONSchema7Type[];
  format?: string;
  maximum?: number;
  minimum?: number;
  onChange?: (value: any) => void;
  props?: any;
  type?: 'string' | 'number' | 'boolean';
  value?: any;
}

const JSONSchemaItemRender = memo<JSONSchemaItemRenderProps>(
  ({ type, enum: enumItems, format, minimum, maximum, ...props }) => {
    switch (type) {
      case 'string': {
        switch (format) {
          case 'password': {
            return <Input {...props} autoComplete={'new-password'} type={'password'} />;
          }
        }

        if (enumItems) {
          return (
            <Select
              {...props}
              options={enumItems.map((i) =>
                typeof i === 'string' ? { label: i, value: i } : (i as any),
              )}
            />
          );
        }

        return <Input {...props} />;
      }

      case 'number': {
        if (typeof minimum === 'number' || typeof maximum === 'number')
          return <Slider max={maximum} min={minimum} {...props} />;
        return <NumberField {...props} />;
      }
      case 'boolean': {
        return <Switch {...props} />;
      }
    }
  },
);

export default JSONSchemaItemRender;
