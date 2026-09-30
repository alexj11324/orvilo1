import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { Badge as Tag } from '@/components/reui/badge';

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
            <Tag style={{ margin: 0 }} variant="info-light">
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
                  <Tag style={{ fontSize: 10, margin: 0 }} variant="info-light">
                    vision
                  </Tag>
                )}
                {model.abilities?.functionCall && (
                  <Tag style={{ fontSize: 10, margin: 0 }} variant="success-light">
                    tools
                  </Tag>
                )}
                {model.abilities?.reasoning && (
                  <Tag style={{ fontSize: 10, margin: 0 }} variant="warning-light">
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
