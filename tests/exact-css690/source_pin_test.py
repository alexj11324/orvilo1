"""Actual source integrity and operational-only guard delta, no Node launch."""
import ast
import hashlib
import json
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def strip_operational(text):
    tree=ast.parse(text)
    tree.body=[node for node in tree.body
               if not (isinstance(node,ast.FunctionDef) and node.name in ['resources','current_cgroup'])
               and not (isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id in ['ROOT','CGROUP','CGROUP_MOUNT'] for target in node.targets))]
    return ast.dump(tree,include_attributes=False)

class ExactSourceTests(unittest.TestCase):
    def test_original_compiler_and_guard_pins(self):
        self.assertEqual(digest(HERE/'compiler.mjs.source'),'c6b551bb6143dae1a249b1134a0567cda92501e2f834f4ca9071e6ba7f512ab5')
        self.assertEqual(digest(HERE/'upstream-guard.py'),'b3e3a639354af0faeca1e2f08fb7f634ec95f93546ea4da26aca17235e1ce8ac')
        self.assertEqual(strip_operational((HERE/'guard.py').read_text()),strip_operational((HERE/'upstream-guard.py').read_text()))
    def test_v2_reuses_frozen_document_grammar_and_preserves_original_compiler(self):
        self.assertNotEqual(digest(HERE/'compiler-v2.mjs.source'),digest(HERE/'compiler.mjs.source'))
        self.assertEqual(digest(HERE/'document-grammar.mjs.source'),'ac90bc40c0dc8354c30b21d6f805bd7c0009e9fb7eea2594090936563029925b')
        self.assertEqual(digest(HERE/'embedded-context.mjs.source'),'1a76f9dc13eeeecd4c3372a34977f5bca5c2d5f0ba5afcef9ae8b77752aff379')
    def test_all_frozen_inputs_preserved(self):
        for row in json.loads((HERE/'source-manifest.json').read_text())['files']:
            self.assertEqual(digest(HERE/row['file']),row['sha256'],row['file'])
        rows=json.loads((HERE/'original-917-obligations.json').read_text())
        self.assertEqual(len(rows),917)
        self.assertEqual(len({row['id']for row in rows}),917)
        for row in rows:
            self.assertTrue(row['origins'])
            for origin in row['origins']:
                self.assertIn('fullLiteral',origin)
                self.assertIn('blob',origin)
                self.assertIn('sha256',origin)
        self.assertEqual(len(json.loads((HERE/'historical-55-refs.json').read_text())),55)

if __name__=='__main__':
    unittest.main()
