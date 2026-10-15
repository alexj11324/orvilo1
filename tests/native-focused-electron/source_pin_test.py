"""Check immutable transport descriptors before starting an Electron process."""
import hashlib
from pathlib import Path
import re
import unittest


class SourcePinTests(unittest.TestCase):
    def test_all_transport_sources_match_their_independent_pins(self):
        directory = Path(__file__).parent
        gate = (directory / 'public-asset-ready-gate.cjs').read_text()
        groups = re.findall(r'(fonts|document|folder):\s*\{(.*?)\n  \}', gate, re.S)
        self.assertEqual(len(groups), 3)
        for kind, body in groups:
            pins = dict(re.findall(r"(manifest|manifestSHA256|helper|helperSHA256): '([^']+)'", body))
            for key in ['manifest', 'helper']:
                with self.subTest(kind=kind, source=key):
                    actual = hashlib.sha256((directory / pins[key]).read_bytes()).hexdigest()
                    self.assertEqual(actual, pins[key + 'SHA256'])
        font_helper = (directory / 'public-stylesheet-font-routes.mjs').read_text()
        expected = re.search(r"expectedManifestSHA256 = '([a-f0-9]{64})'", font_helper)
        self.assertIsNotNone(expected)
        actual = hashlib.sha256((directory / 'public-stylesheet-font-manifest.json').read_bytes()).hexdigest()
        self.assertEqual(actual, expected.group(1))


if __name__ == '__main__':
    unittest.main()
