#!/usr/bin/env python3
"""Bind a fresh real checkout to self-contained immutable compiler inputs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--revision',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    root=args.root.resolve(); out=args.output.resolve()
    assert root not in out.parents and root!=out, 'Output must stay outside actual product root'
    assert not out.exists(), 'Use fresh packet path'
    def git(*argv):
        return subprocess.check_output(['git','--literal-pathspecs','-C',str(root),*argv])
    assert len(args.revision)==40 and git('rev-parse','HEAD').decode().strip()==args.revision
    assert not git('status','--porcelain=v1').strip(), 'Commit pending source; do not delete/stash it'
    manifest=json.loads((HERE/'source-manifest.json').read_text())
    for row in manifest['files']:
        assert digest(HERE/row['file'])==row['sha256'],row['file']
    refs=json.loads((HERE/'historical-55-refs.json').read_text())
    assert len(refs)==55
    missing=[]
    for ref in refs:
        result=subprocess.run(['git','-C',str(root),'cat-file','-e',ref+'^{commit}'],capture_output=True)
        if result.returncode:
            missing.append(ref)
        else:
            git('rev-list','--parents','-n','1',ref)
    assert not missing, 'MISSING_REAL_HISTORICAL_COMMIT_REFS: '+json.dumps(missing)
    original=json.loads((HERE/'original-917-obligations.json').read_text())
    assert len(original)==917
    owners=[]
    config=['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','.gitignore','apps/desktop/package.json','postcss.config.mjs','src/app/globals.css','apps/desktop/vite.renderer.config.ts','plugins/vite/sharedRendererConfig.ts','packages/ui/scripts/build-css.mjs','DESIGN.md','.agents/skills/react/SKILL.md']
    for name in sorted({row['file']for row in original}|set(config)):
        path=root/name
        owners.append({'file':name,'present':path.exists(),'sha256':digest(path)if path.exists()else None})
    out.mkdir(parents=True,mode=0o700)
    for row in manifest['files']:
        shutil.copyfile(HERE/row['file'],out/row['file'])
    shutil.copyfile(HERE/'source-manifest.json',out/'source-manifest.json')
    # Immutable source archive becomes the actual executable only in the
    # external prepared packet; normal repository formatting cannot rewrite it.
    shutil.copyfile(out/'compiler.mjs.source',out/'run.mjs')
    # Explicit history refs are supplied; no machine-local evidence locators or
    # old PASS reports are required. The unchanged compiler expects a directory.
    (out/'evidence-locators').mkdir()
    binding={'root':str(root),'head':args.revision,'tree':git('rev-parse','HEAD^{tree}').decode().strip(),'semanticTrackedTreeSHA256':hashlib.sha256(git('ls-tree','-r','-z','HEAD')).hexdigest(),'ownerPreimages':owners,'originalHistoricalObligations':917,'historicalRefs':refs,'compilerSHA256':digest(out/'run.mjs'),'guardSHA256':digest(out/'guard.py'),'sourceManifestSHA256':digest(out/'source-manifest.json'),'compilerExecuted':False,'issue690Complete':False}
    (out/'binding.json').write_text(json.dumps(binding,indent=2)+'\n')
    (out/'seal.json').write_text(json.dumps({p.name:digest(p)for p in sorted(out.iterdir())if p.is_file()},indent=2)+'\n')
    print(json.dumps({'packet':str(out),'head':args.revision,'historicalRefs':55,'originalHistoricalObligations':917,'ownerPreimages':len(owners),'compilerExecuted':False}))

if __name__=='__main__':
    main()
