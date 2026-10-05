#!/usr/bin/env python3
"""Focused local checks; production activation and gateway builds belong to CI."""
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

import yaml

DIRECTORY = pathlib.Path(__file__).resolve().parent
GATEWAY_ENV = '/run/orvilo-device-gateway/app.env'


def document(path):
    def read(node):
        if isinstance(node, yaml.MappingNode):
            return {key.value: read(value) for key, value in node.value}
        if isinstance(node, yaml.SequenceNode):
            return (node.tag, [read(value) for value in node.value])
        return (node.tag, node.value)
    return read(yaml.compose(path.read_text()))


class DeploymentChecks(unittest.TestCase):
    def test_manual_build_is_rejected_before_any_download(self):
        result = subprocess.run(
            ['bash', str(DIRECTORY / 'build.sh')],
            env={**os.environ, 'GITHUB_ACTIONS': 'false'},
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('GitHub Actions only', result.stderr)

    def test_override_tag_and_unrelated_settings_survive_idempotent_env_update(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = pathlib.Path(temporary) / 'override.yml'
            path.write_text('''services:
  orvilo:
    image: app:original
    ports: !override
      - '127.0.0.1:3210:3210'
    environment:
      UNRELATED_SETTING: keep
    env_file:
      - .env
  hatchet-worker:
    image: worker:original
    env_file:
      - path: worker.env
        required: false
  unrelated:
    image: other:original
''')
            before = document(path)
            subprocess.run(['python3', str(DIRECTORY / 'update-override.py'), str(path)], check=True)
            after = document(path)
            for name in ('orvilo', 'hatchet-worker'):
                self.assertEqual(after['services'][name]['env_file'][1][-1], ('tag:yaml.org,2002:str', GATEWAY_ENV))
                del before['services'][name]['env_file']
                del after['services'][name]['env_file']
            self.assertEqual(before, after)
            self.assertEqual(after['services']['orvilo']['ports'][0], '!override')
            once = path.read_bytes()
            subprocess.run(['python3', str(DIRECTORY / 'update-override.py'), str(path)], check=True)
            self.assertEqual(path.read_bytes(), once)

    def test_unknown_compose_tag_fails_without_rewriting_override(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = pathlib.Path(temporary) / 'override.yml'
            original = 'services:\n  orvilo:\n    ports: !unknown []\n  hatchet-worker: {}\n'
            path.write_text(original)
            result = subprocess.run(['python3', str(DIRECTORY / 'update-override.py'), str(path)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(path.read_text(), original)


class DNSChecks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.records = self.root / 'records.json'
        self.records.write_text('[]')
        self.audit = self.root / 'mutations.json'
        self.audit.write_text('[]')
        fake_cf = self.root / 'cf'
        fake_cf.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
records_file = pathlib.Path(os.environ['CF_TEST_RECORDS'])
audit_file = pathlib.Path(os.environ['CF_TEST_AUDIT'])
records = json.loads(records_file.read_text())
args = sys.argv[1:]
assert args[:2] == ['dns', 'records']
operation = args[2]
def option(name): return args[args.index(name) + 1]
assert option('--zone') == 'test-zone'
if operation == 'list':
    assert option('--name') == 'device-gateway.aspectlylabs.com'
    print(json.dumps([record for record in records if record['name'] == option('--name')]))
    sys.exit()
audit = json.loads(audit_file.read_text())
audit.append(operation)
audit_file.write_text(json.dumps(audit))
if operation == 'create':
    record = json.loads(option('--body'))
    record['id'] = 'new-endpoint'
    records.append(record)
elif operation == 'edit':
    record = next(record for record in records if record['id'] == args[3])
    record.update(json.loads(option('--body')))
elif operation == 'delete':
    assert '--force' in args
    records = [record for record in records if record['id'] != args[3]]
else:
    raise AssertionError(operation)
records_file.write_text(json.dumps(records))
print('{}')
''')
        fake_cf.chmod(0o755)
        self.environment = {
            **os.environ, 'PATH': f'{self.root}:{os.environ["PATH"]}', 'GITHUB_ACTIONS': 'true',
            'CLOUDFLARE_API_TOKEN': 'test-only', 'CLOUDFLARE_ZONE_ID': 'test-zone',
            'CLOUDFLARE_ACCOUNT_ID': 'test-account', 'SSH_HOST': '192.0.2.10',
            'CF_TEST_RECORDS': str(self.records), 'CF_TEST_AUDIT': str(self.audit),
        }

    def run_dns(self, mode, check=True):
        return subprocess.run(
            ['bash', str(DIRECTORY / 'dns.sh'), mode, str(self.root / 'snapshot')],
            env=self.environment, capture_output=True, text=True, check=check,
        )

    def test_create_and_rollback_touch_only_the_endpoint(self):
        unrelated = {'id': 'other', 'name': 'other.example.invalid', 'type': 'A', 'content': '198.51.100.2'}
        self.records.write_text(json.dumps([unrelated]))
        self.run_dns('preflight')
        self.run_dns('publish')
        records = json.loads(self.records.read_text())
        self.assertEqual(records[0], unrelated)
        self.assertEqual(records[1]['content'], '192.0.2.10')
        self.assertTrue(records[1]['proxied'])
        self.run_dns('rollback')
        self.assertEqual(json.loads(self.records.read_text()), [unrelated])

    def test_existing_endpoint_is_restored_including_proxy_and_ttl(self):
        original = {'id': 'endpoint', 'name': 'device-gateway.aspectlylabs.com', 'type': 'A',
                    'content': '198.51.100.3', 'proxied': False, 'ttl': 300, 'comment': 'preserve'}
        self.records.write_text(json.dumps([original]))
        self.run_dns('preflight')
        self.run_dns('publish')
        self.run_dns('rollback')
        self.assertEqual(json.loads(self.records.read_text()), [original])

    def test_conflicting_record_type_is_rejected_without_mutation(self):
        record = {'id': 'conflict', 'name': 'device-gateway.aspectlylabs.com', 'type': 'CNAME', 'content': 'other.example.invalid'}
        self.records.write_text(json.dumps([record]))
        self.assertNotEqual(self.run_dns('preflight', check=False).returncode, 0)
        self.assertEqual(json.loads(self.audit.read_text()), [])
        self.assertEqual(json.loads(self.records.read_text()), [record])


if __name__ == '__main__':
    unittest.main()
