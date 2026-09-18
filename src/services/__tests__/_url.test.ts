import { describe, expect, it } from 'vitest';

import { API_ENDPOINTS } from '../_url';

describe('API_ENDPOINTS', () => {
  it('should return correct basePath URLs', () => {
    expect(API_ENDPOINTS.oauth).toBe('/api/auth');
    expect(API_ENDPOINTS.trace).toBe('/webapi/trace');
  });

  it('should return correct dynamic URLs', () => {
    expect(API_ENDPOINTS.chat('openai')).toBe('/webapi/chat/openai');
    expect(API_ENDPOINTS.tts('openai')).toBe('/webapi/tts/openai');
  });
});
