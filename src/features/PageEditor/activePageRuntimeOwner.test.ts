import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import {
  type ActivePageRuntimeOwnerState,
  bindActivePageRuntimeOwner,
} from './activePageRuntimeOwner';

function fixture() {
  const first = {};
  const second = {};
  const source = createStore<ActivePageRuntimeOwnerState>(() => ({
    activeDocumentId: 'first',
    editor: first,
  }));
  const runtime = {};
  const releasedFirst = vi.fn();
  const releasedSecond = vi.fn();
  const bindFirst = vi.fn(() => releasedFirst);
  const bindSecond = vi.fn(() => releasedSecond);
  const registerFirst = () =>
    bindActivePageRuntimeOwner({
      runtime,
      editor: first,
      documentId: 'first',
      source,
      bind: bindFirst,
    });
  const registerSecond = () =>
    bindActivePageRuntimeOwner({
      runtime,
      editor: second,
      documentId: 'second',
      source,
      bind: bindSecond,
    });
  return {
    first,
    second,
    source,
    runtime,
    bindFirst,
    bindSecond,
    releasedFirst,
    releasedSecond,
    registerFirst,
    registerSecond,
  };
}

describe('active page Runtime ownership across legacy and native page hosts', () => {
  it('does not let a later mounted inactive page replace the actual active owner', () => {
    const f = fixture();
    const closeFirst = f.registerFirst();
    const closeSecond = f.registerSecond();
    expect(f.bindFirst).toHaveBeenCalledTimes(1);
    expect(f.bindSecond).not.toHaveBeenCalled();
    closeSecond();
    expect(f.releasedFirst).not.toHaveBeenCalled();
    closeFirst();
    expect(f.releasedFirst).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'switches using document identity regardless of subscriber order: %s',
    (reverse) => {
      const f = fixture();
      const disposers = reverse
        ? [f.registerSecond(), f.registerFirst()]
        : [f.registerFirst(), f.registerSecond()];
      f.source.setState({ activeDocumentId: 'second', editor: f.second });
      expect(f.releasedFirst).toHaveBeenCalledTimes(1);
      expect(f.bindSecond).toHaveBeenCalledTimes(1);
      expect(f.releasedSecond).not.toHaveBeenCalled();
      // Unrelated store updates must not keep rebinding or erase command maps.
      f.source.setState({ activeDocumentId: 'second', editor: f.second });
      expect(f.bindSecond).toHaveBeenCalledTimes(1);
      for (const dispose of disposers) dispose();
      expect(f.releasedSecond).toHaveBeenCalledTimes(1);
    },
  );

  it('does not let late old-page cleanup clear the new page handlers', () => {
    const f = fixture();
    const closeFirst = f.registerFirst();
    const closeSecond = f.registerSecond();
    f.source.setState({ activeDocumentId: 'second', editor: f.second });
    closeFirst();
    expect(f.releasedSecond).not.toHaveBeenCalled();
    closeSecond();
    closeSecond();
    expect(f.releasedSecond).toHaveBeenCalledTimes(1);
  });

  it('requires both current document and exact editor instance, and detaches before owner loss', () => {
    const f = fixture();
    const closeFirst = f.registerFirst();
    f.source.setState({ editor: f.second });
    expect(f.releasedFirst).toHaveBeenCalledTimes(1);
    expect(f.bindSecond).not.toHaveBeenCalled();
    f.source.setState({ activeDocumentId: 'first', editor: f.first });
    expect(f.bindFirst).toHaveBeenCalledTimes(2);
    closeFirst();
    f.source.setState({ activeDocumentId: 'second', editor: f.second });
    f.source.setState({ activeDocumentId: 'first', editor: f.first });
    expect(f.bindFirst).toHaveBeenCalledTimes(2);
  });
});
