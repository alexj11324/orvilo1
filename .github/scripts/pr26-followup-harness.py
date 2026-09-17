from pathlib import Path
import re
p = Path('src/libs/swr/useSharedPollingSWR.ts')
s = p.read_text().replace('unstable_serialize(augmentKey(key, workspaceId))', 'unstable_serialize(augmentKey(key, workspaceId) as Key)')
a = s.index('  const state = useRef(')
b = s.index('  const interval = ', a)
s = s[:a] + '''  const state = useRef({
    error: response.error, isValidating: response.isValidating,
    isVisible, isOnline, mutate: response.mutate,
  });
  state.current = { error: response.error, isValidating: response.isValidating,
    isVisible, isOnline, mutate: response.mutate };
''' + s[b:]
s = s.replace('isVisible() && isOnline() && !state.current.error && !state.current.isValidating', 'state.current.isVisible() && state.current.isOnline() && !state.current.error && !state.current.isValidating')
s = s.replace('refresh: () => mutate(),', 'refresh: () => state.current.mutate(),')
s = s.replace('[entries, scopedKey, interval, mutate, isVisible, isOnline]', '[entries, scopedKey, interval]')
p.write_text(s)
p = Path('src/store/task/slices/detail/action.ts')
s = re.sub(r'^const TASK_DETAIL_POLL_INTERVAL = .*;\n', '', p.read_text(), flags=re.M)
p.write_text(s)
p = Path('src/store/task/slices/detail/polling.test.tsx')
s = p.read_text().replace('act, cleanup, renderHook', 'act, cleanup, render, renderHook')
s = s.replace("describe('task detail shared polling'", "const PollingConsumer = () => {\n  useTaskStore.getState().useFetchTaskDetail('T-1');\n  return null;\n};\n\ndescribe('task detail shared polling'", 1)
start = s.index('      const page = renderHook', s.index("'preserves the %s deadline"))
end = s.index('    },\n  );', start)
s = s[:start] + '''      const tree = (page: boolean, drawer: boolean) => createElement(wrapper, null,
        page ? createElement(PollingConsumer, { key: 'page' }) : null,
        drawer ? createElement(PollingConsumer, { key: 'drawer' }) : null,
      );
      const view = render(tree(true, false));
      await act(async () => { await vi.advanceTimersByTimeAsync(period - 1_000); });
      expect(taskService.getDetail).toHaveBeenCalledTimes(1);
      view.rerender(tree(true, true));
      await act(async () => { await vi.advanceTimersByTimeAsync(1_050); });
      expect(taskService.getDetail).toHaveBeenCalledTimes(2);
      view.rerender(tree(false, true));
      await act(async () => { await vi.advanceTimersByTimeAsync(period); });
      expect(taskService.getDetail).toHaveBeenCalledTimes(3);
      view.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(period * 3); });
      expect(taskService.getDetail).toHaveBeenCalledTimes(3);
''' + s[end:]
p.write_text(s)
