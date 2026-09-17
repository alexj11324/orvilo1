from pathlib import Path
p = Path('src/libs/swr/useSharedPollingSWR.ts')
p.write_text(p.read_text().replace('unstable_serialize(augmentKey(key, workspaceId))', 'unstable_serialize(augmentKey(key, workspaceId) as Key)'))
p = Path('src/store/task/slices/detail/polling.test.tsx')
s = p.read_text().replace('act, cleanup, renderHook', 'act, cleanup, render, renderHook')
start = s.index('      const page = renderHook', s.index("'preserves the %s deadline"))
end = s.index('    },\n  );', start)
s = s[:start] + '''      const Consumer = () => {
        useTaskStore.getState().useFetchTaskDetail('T-1');
        return null;
      };
      const tree = (page: boolean, drawer: boolean) => createElement(wrapper, null,
        page ? createElement(Consumer, { key: 'page' }) : null,
        drawer ? createElement(Consumer, { key: 'drawer' }) : null,
      );
      // Both siblings use one provider, exactly as page + drawer do in the app.
      // Independent providers sharing a Map have unrelated disposal lifecycles.
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
