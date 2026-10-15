import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { hasNativePageHeader, resolveNativePageHeader } from './nativePageHeader';

describe('native production page custom-header routing', () => {
  it('retains default and explicitly hidden built-in headers', () => {
    expect(hasNativePageHeader({})).toBe(true);
    expect(resolveNativePageHeader({})).toBeUndefined();
    expect(hasNativePageHeader({ header: null })).toBe(true);
    expect(resolveNativePageHeader({ header: null })).toBeNull();
  });
  it('uses the actual native adapter identity, including its explicit null', () => {
    const legacy = createElement('header', { 'data-provider': 'legacy' });
    const native = createElement('header', { 'data-provider': 'native' });
    expect(hasNativePageHeader({ header: legacy, nativeHeader: native })).toBe(true);
    expect(resolveNativePageHeader({ header: legacy, nativeHeader: native })).toBe(native);
    expect(resolveNativePageHeader({ header: legacy, nativeHeader: null })).toBeNull();
  });
  it('never silently mounts a legacy Provider header in the native context', () => {
    const header = createElement('header', { 'data-provider': 'legacy' });
    expect(hasNativePageHeader({ header })).toBe(false);
    expect(() => resolveNativePageHeader({ header })).toThrow('nativeHeader');
    expect(hasNativePageHeader({ header: false })).toBe(false);
  });
});
