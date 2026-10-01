"""Cloud reconstruction: bounded advisory lexical bridge to pinned upstream code."""
import json
import resource
import subprocess
import sys
import types
from pathlib import Path

resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
PIN = '7d442aafa985f9342134fac16c2ef41f03fb45c1'
root = Path(sys.argv[1]).resolve()
source = subprocess.check_output(['git', '--no-replace-objects', '-C', str(root), 'show', PIN + ':prime-agent-runtime/src/rlm/harness.py'], timeout=5)
module = types.ModuleType('orvilo_prime_lexical')
module.__file__ = str(root / 'prime-agent-runtime/src/rlm/harness.py')
sys.modules[module.__name__] = module
exec(compile(source, module.__file__, 'exec'), module.__dict__)
payload = json.loads(sys.stdin.buffer.read(2_500_001))
if len(payload['records']) > 500 or len(payload['query']) > 512 or not 1 <= payload['limit'] <= 50:
    raise ValueError('Invalid lexical input')
state = module.HarnessState(in_memory=True)
for row in payload['records']:
    if len(row['content'].encode('utf-8')) > 16384:
        raise ValueError('Invalid content')
    entry = state.create_memory(row['id'], row['content'], id=row['id'], path='experience')
    entry.updated_at = row['updatedAt']
results = state.search(payload['query'], kind='memory', limit=payload['limit'])
print(json.dumps({'ids': [entry.id for entry in results], 'revision': PIN}))
