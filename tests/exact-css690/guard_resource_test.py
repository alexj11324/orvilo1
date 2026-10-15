"""Pure tests of the actual guard function; never launch Node or processes."""
import ast
from pathlib import Path
import unittest

class ResourceGuardTests(unittest.TestCase):
    def setUp(self):
        self.files = {}
        files = self.files
        class FakePath:
            def __init__(self, path): self.path = path
            def __truediv__(self, name): return FakePath(self.path + '/' + name)
            @property
            def parent(self): return FakePath(self.path.rsplit('/', 1)[0])
            def __eq__(self, other): return isinstance(other, FakePath) and self.path == other.path
            def __str__(self): return self.path
            def is_file(self): return self.path in files
            def read_text(self):
                if self.path not in files: raise FileNotFoundError(self.path)
                return files[self.path]
        self.root = '/sys/fs/cgroup'
        self.scope = self.root + '/native'
        self.files['/proc/meminfo'] = 'MemAvailable: 8000000 kB\n'
        self.budget(self.scope, 6 * 1024**3)
        fn = next(node for node in ast.parse(Path(__file__).with_name('guard.py').read_text()).body
                  if isinstance(node, ast.FunctionDef) and node.name == 'resources')
        context = {'CGROUP': FakePath(self.scope), 'CGROUP_MOUNT': FakePath(self.root),
                   'ROOT': FakePath('/checkout'), 'Path': FakePath, 'disk_free': lambda _: 1024**4}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), 'actual-guard-resources', 'exec'), context)
        self.resources = context['resources']

    def budget(self, directory, maximum='max'):
        self.files[directory + '/memory.max'] = str(maximum)
        self.files[directory + '/memory.current'] = str(1024**3)
        self.files[directory + '/memory.events'] = 'oom 0\noom_kill 0\nmax 0\n'

    def test_real_hierarchy_root_may_omit_all_memory_interfaces(self):
        result = self.resources()
        self.assertEqual(result['memoryHeadroom'], 5 * 1024**3)
        self.assertEqual(len(result['hierarchyRootMissingInterfaces']), 3)

    def test_all_unbounded_rejects_even_if_root_omits_interfaces(self):
        self.budget(self.scope)
        with self.assertRaisesRegex(RuntimeError, 'No finite'): self.resources()

    def test_nonroot_missing_interface_rejects(self):
        del self.files[self.scope + '/memory.events']
        with self.assertRaises(FileNotFoundError): self.resources()

    def test_tighter_ancestor_cannot_bypass_original_admission(self):
        self.budget(self.root, 2 * 1024**3)
        self.assertLess(self.resources()['memoryHeadroom'], 3528114005)

    def test_host_available_memory_cannot_be_bypassed(self):
        self.files['/proc/meminfo'] = 'MemAvailable: 100000 kB\n'
        self.assertLess(self.resources()['memoryHeadroom'], 3528114005)

if __name__ == '__main__': unittest.main()
