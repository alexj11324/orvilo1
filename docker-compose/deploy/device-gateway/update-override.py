#!/usr/bin/env python3
"""Append the gateway runtime env file to the two existing service overrides."""
import os
import pathlib
import sys
import tempfile

import yaml

class ComposeLoader(yaml.SafeLoader):
    pass


class ComposeDumper(yaml.SafeDumper):
    pass


class OverrideSequence(list):
    pass


ComposeLoader.add_constructor(
    '!override', lambda loader, node: OverrideSequence(loader.construct_sequence(node, deep=True))
)
ComposeDumper.add_representer(
    OverrideSequence, lambda dumper, value: dumper.represent_sequence('!override', value)
)

path = pathlib.Path(sys.argv[1])
# Compose uses !override for the production port mapping. Unknown tags still
# fail before the file is modified; this is not a rendered Compose config.
config = yaml.load(path.read_text(), Loader=ComposeLoader)
services = config.get('services', {})
for name in ('orvilo', 'hatchet-worker'):
    if name not in services or not isinstance(services[name], dict):
        raise SystemExit(f'Missing existing service override: {name}')
    service = services[name]
    entries = service.get('env_file', [])
    if isinstance(entries, str):
        entries = [entries]
    if not isinstance(entries, list):
        raise SystemExit(f'Unsupported env_file in {name}')
    gateway_env = '/run/orvilo-device-gateway/app.env'
    if not any((entry.get('path') if isinstance(entry, dict) else entry) == gateway_env for entry in entries):
        service['env_file'] = type(entries)([*entries, gateway_env])

fd, temporary = tempfile.mkstemp(prefix='.device-gateway-override-', dir=path.parent)
try:
    os.fchmod(fd, path.stat().st_mode & 0o777)
    with os.fdopen(fd, 'w') as stream:
        yaml.dump(config, stream, Dumper=ComposeDumper, sort_keys=False)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
