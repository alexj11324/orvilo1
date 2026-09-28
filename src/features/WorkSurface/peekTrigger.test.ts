import { act, renderHook } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  isInteractiveRowClick,
  peekRowTriggerProps,
  ROW_INTERACTIVE_SELECTOR,
  usePeekSelection,
} from './peekTrigger';

const syntheticClick = (target: EventTarget | null) =>
  ({
    currentTarget: document.createElement('div'),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target,
  }) as unknown as ReactMouseEvent;

describe('isInteractiveRowClick', () => {
  it('lets clicks on interactive descendants through', () => {
    const button = document.createElement('button');
    const span = document.createElement('span');
    button.append(span);
    expect(isInteractiveRowClick(button)).toBe(true);
    expect(isInteractiveRowClick(span)).toBe(true);
  });

  it('covers links, popup triggers and explicit row-interactive markers', () => {
    const link = document.createElement('a');
    link.setAttribute('href', '/task/T-1');
    const popup = document.createElement('div');
    popup.setAttribute('aria-haspopup', 'menu');
    const openPopup = document.createElement('div');
    openPopup.setAttribute('data-popup-open', '');
    const chip = document.createElement('div');
    chip.setAttribute('data-row-interactive', 'true');
    const inner = document.createElement('span');
    chip.append(inner);

    for (const target of [link, popup, openPopup, chip, inner]) {
      expect(isInteractiveRowClick(target)).toBe(true);
    }
  });

  it('ignores plain row chrome and non-Element targets', () => {
    expect(isInteractiveRowClick(document.createElement('div'))).toBe(false);
    expect(isInteractiveRowClick(null)).toBe(false);
    expect(isInteractiveRowClick('button')).toBe(false);
  });

  it('stays a plain CSS selector list for closest()', () => {
    expect(ROW_INTERACTIVE_SELECTOR).toContain('[data-row-interactive]');
    expect(ROW_INTERACTIVE_SELECTOR).toContain('[aria-haspopup]');
  });
});

describe('peekRowTriggerProps', () => {
  it('selects the item on a plain click, claiming the event', () => {
    const item = { id: 'T-1' };
    const onSelect = vi.fn();
    const event = syntheticClick(document.createElement('div'));

    const { onClickCapture } = peekRowTriggerProps(item, { onSelect });
    expect(onClickCapture).toBeTypeOf('function');
    onClickCapture?.(event);

    expect(onSelect).toHaveBeenCalledWith(item);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('leaves interactive chrome to its own gesture', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const button = document.createElement('button');
    const { onClickCapture, onDoubleClick } = peekRowTriggerProps('T-1', {
      onOpen,
      onSelect,
    });

    onClickCapture?.(syntheticClick(button));
    onDoubleClick?.(syntheticClick(button));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the full page on double click', () => {
    const item = { id: 'T-2' };
    const onOpen = vi.fn();
    const { onDoubleClick } = peekRowTriggerProps(item, { onOpen });

    onDoubleClick?.(syntheticClick(document.createElement('span')));
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('renders no handlers when disabled — the row keeps its own click', () => {
    const { onClickCapture, onDoubleClick } = peekRowTriggerProps('T-1', {
      enabled: false,
      onOpen: vi.fn(),
      onSelect: vi.fn(),
    });
    expect(onClickCapture).toBeUndefined();
    expect(onDoubleClick).toBeUndefined();
  });

  it('renders only the triggers the caller asked for', () => {
    const selectOnly = peekRowTriggerProps('T-1', { onSelect: vi.fn() });
    expect(selectOnly.onClickCapture).toBeTypeOf('function');
    expect(selectOnly.onDoubleClick).toBeUndefined();

    const openOnly = peekRowTriggerProps('T-1', { onOpen: vi.fn() });
    expect(openOnly.onClickCapture).toBeUndefined();
    expect(openOnly.onDoubleClick).toBeTypeOf('function');
  });
});

describe('usePeekSelection', () => {
  it('starts empty and keeps the caller-set selection', () => {
    const { result } = renderHook(() => usePeekSelection<string>('list-a'));
    expect(result.current[0]).toBeNull();

    act(() => result.current[1]('T-1'));
    expect(result.current[0]).toBe('T-1');
  });

  it('drops the selection when the list identity changes', () => {
    const { rerender, result } = renderHook(({ listKey }) => usePeekSelection<string>(listKey), {
      initialProps: { listKey: 'list-a' },
    });
    act(() => result.current[1]('T-1'));
    expect(result.current[0]).toBe('T-1');

    rerender({ listKey: 'list-b' });
    expect(result.current[0]).toBeNull();
  });
});
