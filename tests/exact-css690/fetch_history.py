#!/usr/bin/env python3
"""Normal Git transport only; absent historical objects fail closed by exact ref."""
import argparse
import json
from pathlib import Path
import re
import subprocess

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args()
refs=json.loads(Path(__file__).with_name('historical-55-refs.json').read_text())
assert len(refs)==55
failed=[]
for ref in refs:
    assert re.fullmatch('[0-9a-f]{40}',ref)
    present=subprocess.run(['git','-C',str(args.root),'cat-file','-e',ref+'^{commit}'],capture_output=True)
    if present.returncode:
        fetched=subprocess.run(['git','-C',str(args.root),'fetch','--no-tags','origin',ref],capture_output=True)
        if fetched.returncode:
            # Do not print transport diagnostics, URLs, git credential headers,
            # or any token. Exact unavailable object is sufficient to repair it.
            failed.append({'ref':ref,'reason':'NORMAL_GIT_FETCH_FAILED','exitCode':fetched.returncode})
            continue
    parent=subprocess.run(['git','-C',str(args.root),'rev-parse',ref+'^1'],capture_output=True,text=True)
    if parent.returncode:
        failed.append({'ref':ref,'reason':'REAL_FIRST_PARENT_UNAVAILABLE'})
        continue
    check=subprocess.run(['git','-C',str(args.root),'cat-file','-e',parent.stdout.strip()+'^{tree}'],capture_output=True)
    if check.returncode:
        failed.append({'ref':ref,'reason':'REAL_PARENT_TREE_UNAVAILABLE'})
print(json.dumps({'historicalRefs':len(refs),'unavailable':failed,'oldPassReused':False}))
if failed:
    raise SystemExit(2)
