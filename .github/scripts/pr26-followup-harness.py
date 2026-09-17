from pathlib import Path
p = Path('src/libs/swr/useSharedPollingSWR.ts')
p.write_text(p.read_text().replace('unstable_serialize(augmentKey(key, workspaceId))', 'unstable_serialize(augmentKey(key, workspaceId) as Key)'))
p = Path('src/store/task/slices/detail/action.ts')
s = p.read_text()
import re
s = re.sub(r'^const TASK_DETAIL_POLL_INTERVAL = .*;\n', '', s, flags=re.M)
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
      // One provider owns the page and drawer subscriptions, as in the app.
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
