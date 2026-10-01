import { describe, expect, it } from 'vitest';

import enUSModels from '../../../locales/en-US/models.json';
import zhCNModels from '../../../locales/zh-CN/models.json';
import { orviloHubOnlineModelDescriptions } from './orviloOnlineModelDescriptions';

const enUSDescriptions = enUSModels as Record<string, string>;
const zhCNDescriptions = zhCNModels as Record<string, string>;

const addedDescriptionKeys = [
  'orvilo.deepseek-v4-flash-vision-exp.description',
  'orvilo.gemini-3.1-flash-image.description',
  'orvilo.gemini-3.1-flash-image:image.description',
  'orvilo.gemini-3.7-flash.description',
  'orvilo.glm-5.3-flash.description',
  'orvilo.qwen3.8-max.description',
  'orvilo.grok-4.6.description',
] as const;

describe('Orvilo online model descriptions', () => {
  it.each(addedDescriptionKeys)('ships English and Chinese translations for %s', (key) => {
    expect(enUSDescriptions[key]).toBe(orviloHubOnlineModelDescriptions[key]);
    expect(zhCNDescriptions[key]).toMatch(/[\u3400-\u9FFF]/u);
  });

  it.each([
    ['gemini-3.1-flash-image.description', 'gemini-3.1-flash-image-preview.description'],
    [
      'gemini-3.1-flash-image:image.description',
      'gemini-3.1-flash-image-preview:image.description',
    ],
  ])('ships the stable Google translation for %s', (stableKey, previewKey) => {
    expect(enUSDescriptions[stableKey]).toBe(enUSDescriptions[previewKey]);
    expect(zhCNDescriptions[stableKey]).toBe(zhCNDescriptions[previewKey]);
  });
});
