#!/usr/bin/env python3
"""Root-only execution entry. Preserves real HOLD outcomes and original reserves."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--node', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--lease', required=True, help='Already-held genuine Root exclusive heavy-work lease')
    args = parser.parse_args()
    for name, digest in json.loads((HERE/'seal.json').read_text()).items():
        assert sha(HERE/name) == digest, name
    binding = json.loads((HERE/'binding.json').read_text())
    root = Path(binding['root'])
    def git(*argv):
        return subprocess.check_output(['git','--literal-pathspecs','-C',str(root),*argv])
    assert git('rev-parse','HEAD').decode().strip() == binding['head'], 'Create a new binding; never edit old HEAD field'
    assert not git('status','--porcelain=v1').strip(), 'Commit pending work before executing'
    assert hashlib.sha256(git('ls-tree','-r','-z','HEAD')).hexdigest() == binding['semanticTrackedTreeSHA256']
    for row in binding['ownerPreimages']:
        path=root/row['file']
        assert path.exists() == row['present'], row['file']
        if row['present']:
            assert sha(path) == row['sha256'], row['file']
    guard = HERE/'guard.py'
    assert sha(guard) == binding['guardSHA256']
    assert args.node.resolve().is_file(), 'Supply the genuine setup-node executable'
    assert root not in args.output.resolve().parents and args.output.resolve()!=root, 'Evidence stays outside product checkout'
    assert not args.output.exists(), 'Fresh execution output required'
    command=[sys.executable,str(guard),'--output',str(args.output),'--node',str(args.node),'--script',str(HERE/'run.mjs'),'--head',binding['head'],'--lease',args.lease,'--scope','issue690-whole-current-exact-css','--tool-args','--root',str(root),'--out',str(args.output/'tool-result'),'--historical-evidence',str(HERE/'evidence-locators')]
    for ref in binding['historicalRefs']:
        command.extend(['--history-ref',ref])
    environment=dict(os.environ)
    environment['ORVILO_PRODUCT_ROOT']=str(root)
    result=subprocess.run(command,check=False,env=environment)
    report={'boundHead':binding['head'],'guardExitCode':result.returncode,'status':'HOLD','issue690Complete':False,'noOldPassReused':True}
    folder=args.output/'tool-result'
    try:
        summary=json.loads((folder/'summary.json').read_text())
        old=json.loads((HERE/'original-917-obligations.json').read_text())
        current=json.loads((folder/'counterpart-obligations.json').read_text())
        actual={row['id']:row for row in current}
        missing=[]; lost_origins=[]
        for row in old:
            counterpart=actual.get(row['id'])
            if counterpart is None:
                missing.append(row['id']); continue
            origins={json.dumps(origin,sort_keys=True) for origin in counterpart['origins']}
            for origin in row['origins']:
                if json.dumps(origin,sort_keys=True) not in origins:
                    lost_origins.append({'id':row['id'],'origin':origin})
        assert len(old)==917
        report.update({'actualHead':summary.get('initialHead'),'actualSummaryStatus':summary.get('status'),'originalHistoricalSites':917,'missingOriginalSites':missing,'lostOriginalContexts':lost_origins,'allOriginalSitesAndContextsRetained':not missing and not lost_origins,'actualObligations':len(current),'actualCompiledFacts':summary.get('compiled'),'actualBlockers':summary.get('blockers'),'summarySHA256':sha(folder/'summary.json')})
        if result.returncode==0 and summary.get('status')=='CURRENT_SCOPE_EXACT_COMPILE_PASS' and summary.get('initialHead')==binding['head'] and not missing and not lost_origins:
            report['status']='CURRENT_WHOLE_COMPILER_SCOPE_PASS_ONLY'
    except (OSError,ValueError,KeyError,AssertionError) as error:
        report['actualMissingOrInvalidEvidence']=str(error)
    if args.output.is_dir():
        (args.output/'complete-917-coverage-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'head':binding['head'],'guardExitCode':result.returncode,'issue690Complete':False}))
    return 0 if report['status']=='CURRENT_WHOLE_COMPILER_SCOPE_PASS_ONLY' else 2

if __name__ == '__main__':
    sys.exit(main())
