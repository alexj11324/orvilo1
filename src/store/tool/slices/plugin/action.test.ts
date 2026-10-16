import { type OrviloTool } from '@orvilo/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToolStore } from '../../store';

vi.mock('@/services/plugin', () => ({
  pluginService: {
    getInstalledPlugins: vi.fn().mockResolvedValue([]),
    updatePluginSettings: vi.fn(),
  },
}));

beforeEach(() => {
  // Reset all mocks before each test
  vi.resetAllMocks();
});

describe('useToolStore:plugin', () => {
  describe('checkPluginsIsInstalled', () => {
    it('should be deprecated and do nothing', async () => {
      // Old plugin system has been deprecated
      const { result } = renderHook(() => useToolStore());

      await act(async () => {
        await result.current.checkPluginsIsInstalled(['plugin1', 'plugin2']);
      });

      // Should not call any methods since old plugin system is deprecated
    });
  });

  describe('validatePluginSettings', () => {
    // 模拟插件数据
    const testPluginId = 'test-plugin';
    // 定义测试用的 schema 和模拟的验证结果
    const testSchema = {
      properties: { abc: { type: 'string' } },
      required: ['abc'],
      type: 'object',
    };

    const testPluginSettings = { abc: 'valid-string' };

    const testPlugin = {
      type: 'plugin',
      identifier: testPluginId,
      manifest: {
        identifier: testPluginId,
        settings: testSchema,
      },
      settings: testPluginSettings,
    } as unknown as OrviloTool;

    it('should validate settings against the schema and return valid result', async () => {
      const { result } = renderHook(() => useToolStore());

      act(() => {
        useToolStore.setState({
          installedPlugins: [testPlugin],
        });
      });

      const validationResult = await result.current.validatePluginSettings(testPluginId);

      expect(validationResult).toEqual({ valid: true, errors: [] });
    });

    it('should return invalid result if settings do not match the schema', async () => {
      const { result } = renderHook(() => useToolStore());
      act(() => {
        useToolStore.setState({
          installedPlugins: [{ ...testPlugin, settings: {} }] as any,
        });
      });

      const validationResult = await result.current.validatePluginSettings(testPluginId);

      expect(validationResult).toMatchSnapshot();
    });

    it('should return undefined if manifest or settings are not found', async () => {
      useToolStore.setState({
        installedPlugins: [],
      });

      const { result } = renderHook(() => useToolStore());

      const validationResult = await result.current.validatePluginSettings(testPluginId);

      expect(validationResult).toBeUndefined();
    });
  });
});
