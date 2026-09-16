"""Apply the reviewed source patch on this isolated feature branch only."""
import base64
import hashlib
import lzma
import subprocess
from pathlib import Path

encoded = ''.join(Path(f'.github/prerequisites-transfer/patch.{i}').read_text().strip() for i in range(1, 4))
patch = lzma.decompress(base64.b64decode(encoded, validate=True))
expected = 'a1c58226cb48916c93db34d08555f6ce3b54df2e725cb77d0eef0227a9fc282e'
if hashlib.sha256(patch).hexdigest() != expected:
    raise RuntimeError('Source patch checksum mismatch; refusing to change the branch')
check = subprocess.run(['git', 'apply', '--check', '-'], input=patch, capture_output=True)
if check.returncode == 0:
    subprocess.run(['git', 'apply', '-'], input=patch, check=True)
else:
    reverse = subprocess.run(['git', 'apply', '--reverse', '--check', '-'], input=patch, capture_output=True)
    if reverse.returncode != 0:
        raise RuntimeError(check.stderr.decode())
    print('Exact source patch already present; not applying it twice')
subprocess.run(['git', 'diff', '--check'], check=True)
