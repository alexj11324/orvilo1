import { describe, expect, it } from 'vitest';

import { parseProtocolUrl } from '../protocol';

describe('Protocol', () => {
  describe('parseProtocolUrl', () => {
    it('should return null for invalid protocol', () => {
      const result = parseProtocolUrl('http://example.com');
      expect(result).toBeNull();
    });

    it('should parse URLs with any action', () => {
      const result = parseProtocolUrl('orvilo://plugin/configure?id=test');
      expect(result).toBeTruthy();
      expect(result?.urlType).toBe('plugin');
      expect(result?.action).toBe('configure');
      expect(result?.params.id).toBe('test');
    });

    it('should parse URLs with any query parameters', () => {
      const result = parseProtocolUrl('orvilo://plugin/install?custom=value&another=param');
      expect(result).toBeTruthy();
      expect(result?.urlType).toBe('plugin');
      expect(result?.action).toBe('install');
      expect(result?.params.custom).toBe('value');
      expect(result?.params.another).toBe('param');
    });

    it('should handle URLs without query parameters', () => {
      const result = parseProtocolUrl('orvilo://plugin/install');
      expect(result).toBeTruthy();
      expect(result?.urlType).toBe('plugin');
      expect(result?.action).toBe('install');
      expect(Object.keys(result?.params || {})).toHaveLength(0);
    });

    it('should return null for URLs without action', () => {
      const result = parseProtocolUrl('orvilo://plugin/');
      expect(result).toBeNull();
    });
  });

  describe('URL encoding/decoding', () => {
    it('should handle different protocol schemes', () => {
      const testCases = [
        'orvilo://plugin/install?test=value',
        'orvilo-dev://plugin/install?test=value',
        'orvilo-beta://plugin/install?test=value',
        'orvilo-nightly://plugin/install?test=value',
      ];

      testCases.forEach((url) => {
        const parsed = parseProtocolUrl(url);
        expect(parsed).toBeTruthy();
        expect(parsed?.urlType).toBe('plugin');
        expect(parsed?.action).toBe('install');
        expect(parsed?.params.test).toBe('value');
        expect(parsed?.originalUrl).toBe(url);
      });
    });
  });
});
