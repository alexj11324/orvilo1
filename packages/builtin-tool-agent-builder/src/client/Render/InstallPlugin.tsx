'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { memo } from 'react';

import type { InstallPluginParams, InstallPluginState } from '../../types';

const InstallPlugin = memo<BuiltinRenderProps<InstallPluginParams, InstallPluginState>>(
  ({ pluginState }) => {
    const {
      pluginId,
      pluginName,
      installed,
      awaitingApproval,
      isComposio,
      isOrviloSkill,
      serverStatus,
      error,
    } = pluginState || {};

    if (!pluginId) return null;

    // Error state
    if (error) {
      return (
        <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
          <XCircle size={14} style={{ color: 'var(--lobe-error-6)' }} />
          <span style={{ fontWeight: 500 }}>
            Failed to install plugin:{' '}
            <code
              style={{
                background: 'var(--lobe-fill-tertiary)',
                borderRadius: 4,
                color: 'var(--lobe-text)',
                fontSize: 12,
                padding: '2px 6px',
              }}
            >
              {pluginName || pluginId}
            </code>
          </span>
        </div>
      );
    }

    // Awaiting approval state
    if (awaitingApproval) {
      return (
        <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
          <Clock size={14} style={{ color: 'var(--lobe-warning-6)' }} />
          <span style={{ fontWeight: 500 }}>
            {isComposio || isOrviloSkill ? (
              <>
                Waiting for authorization:{' '}
                <code
                  style={{
                    background: 'var(--lobe-fill-tertiary)',
                    borderRadius: 4,
                    color: 'var(--lobe-text)',
                    fontSize: 12,
                    padding: '2px 6px',
                  }}
                >
                  {pluginName || pluginId}
                </code>
                {serverStatus === 'pending_auth' && (
                  <span style={{ color: 'var(--lobe-text-tertiary)', marginLeft: 8 }}>
                    (OAuth required)
                  </span>
                )}
              </>
            ) : (
              <>
                Waiting for installation approval:{' '}
                <code
                  style={{
                    background: 'var(--lobe-fill-tertiary)',
                    borderRadius: 4,
                    color: 'var(--lobe-text)',
                    fontSize: 12,
                    padding: '2px 6px',
                  }}
                >
                  {pluginName || pluginId}
                </code>
              </>
            )}
          </span>
        </div>
      );
    }

    // Installed state
    if (installed) {
      return (
        <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
          <CheckCircle size={14} style={{ color: 'var(--lobe-success-6)' }} />
          <span style={{ fontWeight: 500 }}>
            {isComposio || isOrviloSkill ? 'Connected and enabled' : 'Installed and enabled'}:{' '}
            <code
              style={{
                background: 'var(--lobe-fill-tertiary)',
                borderRadius: 4,
                color: 'var(--lobe-text)',
                fontSize: 12,
                padding: '2px 6px',
              }}
            >
              {pluginName || pluginId}
            </code>
          </span>
        </div>
      );
    }

    return null;
  },
);

export default InstallPlugin;
