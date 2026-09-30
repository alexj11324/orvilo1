import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast, ToastHost, useToast } from '.';

const sonnerCalls = vi.hoisted(() => ({
  custom: vi.fn(() => 'custom-id'),
  default: vi.fn(() => 'default-id'),
  dismiss: vi.fn(),
  error: vi.fn(() => 'error-id'),
  info: vi.fn(() => 'info-id'),
  loading: vi.fn(() => 'loading-id'),
  success: vi.fn(() => 'success-id'),
  warning: vi.fn(() => 'warning-id'),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(sonnerCalls.default, {
    custom: sonnerCalls.custom,
    dismiss: sonnerCalls.dismiss,
    error: sonnerCalls.error,
    info: sonnerCalls.info,
    loading: sonnerCalls.loading,
    success: sonnerCalls.success,
    warning: sonnerCalls.warning,
  }),
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

describe('toast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('string input maps to the variant call', () => {
    toast.success('saved');
    expect(sonnerCalls.success).toHaveBeenCalledWith(
      'saved',
      expect.objectContaining({ duration: 5000 }),
    );
  });

  it('options map title/description/duration/id', () => {
    toast.error({ description: 'd', duration: 100, id: 'x', title: 'boom' });
    expect(sonnerCalls.error).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({ description: 'd', duration: 100, id: 'x' }),
    );
  });

  it('actions[0]/actions[1] map to sonner action/cancel', () => {
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    toast({
      actions: [
        { label: 'yes', onClick: onFirst },
        { label: 'no', onClick: onSecond },
      ],
      title: 'pick',
    });
    const [, data] = sonnerCalls.default.mock.calls[0];
    expect(data.action.label).toBe('yes');
    expect(data.cancel.label).toBe('no');
    data.action.onClick();
    data.cancel.onClick();
    expect(onFirst).toHaveBeenCalled();
    expect(onSecond).toHaveBeenCalled();
  });

  it('instance.close dismisses by id', () => {
    const instance = toast.info('hi');
    instance.close();
    expect(sonnerCalls.dismiss).toHaveBeenCalledWith('info-id');
  });

  it('update re-issues with the same id (dedupe)', () => {
    const instance = toast.info('hi');
    instance.update({ title: 'hi2' });
    expect(sonnerCalls.info).toHaveBeenLastCalledWith(
      'hi2',
      expect.objectContaining({ id: 'info-id' }),
    );
  });

  it('callable form routes on type', () => {
    toast({ title: 'w', type: 'warning' });
    expect(sonnerCalls.warning).toHaveBeenCalledWith('w', expect.anything());
  });

  it('dismiss without id forwards undefined', () => {
    toast.dismiss();
    expect(sonnerCalls.dismiss).toHaveBeenCalledWith(undefined);
  });

  it('useToast returns the same api', () => {
    expect(useToast()).toBe(toast);
  });

  it('promise shows loading then success, returning the original promise', async () => {
    const p = Promise.resolve('ok');
    const out = await toast.promise(p, {
      error: 'bad',
      loading: 'wait',
      success: (d) => `done ${d}`,
    });
    expect(out).toBe('ok');
    expect(sonnerCalls.loading).toHaveBeenCalledWith('wait', expect.anything());
    expect(sonnerCalls.success).toHaveBeenCalledWith('done ok', expect.anything());
  });
});

describe('ToastHost', () => {
  it('exports a component', () => {
    expect(typeof ToastHost).toBe('object'); // memo component
  });
});
