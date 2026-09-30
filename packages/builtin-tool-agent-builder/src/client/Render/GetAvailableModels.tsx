import { Tag } from '@lobehub/ui/base-ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import type { GetAvailableModelsParams, GetAvailableModelsState } from '../../types';

const GetAvailableModels = memo<
  BuiltinRenderProps<GetAvailableModelsParams, GetAvailableModelsState>
>(({ pluginState }) => {
  const { providers } = pluginState || {};

  if (!providers || providers.length === 0) {
    return (
      <div className="flex flex-col" style={{ color: 'var(--lobe-text-secondary)', fontSize: 13 }}>
        No available models found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ fontSize: 13 }}>
      {providers.map((provider) => (
        <div className="flex flex-col gap-2" key={provider.id}>
          <div className="flex items-center gap-2">
            <span style={{ fontWeight: 600 }}>{provider.name}</span>
            <Tag color="blue" style={{ margin: 0 }}>
              {provider.models.length} models
            </Tag>
          </div>
          <div
            className="flex flex-col gap-1"
            style={{
              background: 'var(--lobe-fill-tertiary)',
              borderRadius: 6,
              maxHeight: 200,
              overflow: 'auto',
              padding: 8,
            }}
          >
            {provider.models.map((model) => (
              <div className="flex items-center gap-2" key={model.id} style={{ fontSize: 12 }}>
                <code style={{ color: 'var(--lobe-text)' }}>{model.id}</code>
                {model.abilities?.vision && (
                  <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>
                    vision
                  </Tag>
                )}
                {model.abilities?.functionCall && (
                  <Tag color="green" style={{ fontSize: 10, margin: 0 }}>
                    tools
                  </Tag>
                )}
                {model.abilities?.reasoning && (
                  <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>
                    reasoning
                  </Tag>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

export default GetAvailableModels;
