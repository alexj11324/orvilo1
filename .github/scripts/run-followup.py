import base64
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import zlib

plan = json.loads(os.environ['AUDIT_PLAN'])
evidence = Path('/tmp/evidence')
evidence.mkdir(exist_ok=True)

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def logged(args, name, cwd=None, expected_failure=False):
    with (evidence / name).open('w') as log:
        result = subprocess.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
    if not expected_failure and result.returncode:
        print((evidence / name).read_text()[-20000:])
        raise SystemExit(result.returncode)
    return result.returncode

def test(project, files, name, pattern='', expected_failure=False):
    report = str(evidence / f'{name}.json')
    args = ['bunx','vitest','run','--silent=passed-only','--reporter=default','--reporter=json',f'--outputFile={report}']
    if project != 'db': args += ['--project', project]
    else: args += ['--no-file-parallelism']
    args += shlex.split(files)
    if pattern: args += ['-t', pattern]
    return logged(args, f'{name}.log', cwd='packages/database' if project == 'db' else None, expected_failure=expected_failure)

phase = sys.argv[1]
if phase == 'prepare':
    source_sha = os.environ['GITHUB_SHA']
    scripts = []
    for index, path in enumerate(plan.get('apply', [])):
        target = Path(f'/tmp/apply-{index}.py')
        target.write_text(git('show',f'{source_sha}:{path}') + '\n')
        scripts.append(target)
    patch = plan.get('patch')
    if patch:
        Path('/tmp/fix.patch').write_bytes(zlib.decompress(base64.b64decode(git('show',f'{source_sha}:{patch}'))))
    run(['git','checkout','--detach',plan['base']])
    run(['git','config','user.name','github-actions[bot]'])
    run(['git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com'])
    if plan.get('merge'):
        run(['git','merge','--no-ff',plan['merge'],'-m','🔀 chore: reconcile the current reviewed base'])
    if patch:
        run(['git','apply','--check','/tmp/fix.patch'])
        run(['git','apply','/tmp/fix.patch'])
    for script in scripts: run(['python',str(script)])
    run(['git','add','-N','.'])
    (evidence/'changed.txt').write_text(git('diff','--name-only')+'\n')
elif phase == 'freeze':
    paths=(evidence/'changed.txt').read_text().splitlines()
    lint_paths=[p for p in paths if p.endswith(('.ts','.tsx','.mjs','.cjs','.json','.yml','.yaml'))]
    if lint_paths: logged(['bun','run','check','--lint',*lint_paths],'lint.log')
    run(['git','diff','--check'])
    run(['git','add','--',*paths])
    run(['git','commit','-m',f"🐛 fix: address reviewed PR{plan['pr']} audit regressions"])
    (evidence/'source-sha.txt').write_text(git('rev-parse','HEAD')+'\n')
    (evidence/'tree-sha.txt').write_text(git('rev-parse','HEAD^{tree}')+'\n')
    (evidence/'source.patch').write_text(git('diff',plan['base'],'HEAD')+'\n')
    run(['git','bundle','create',str(evidence/'candidate.bundle'),'HEAD',f"^{plan['base']}"])
    manifest=[]
    for p in git('diff','--name-only',plan['base'],'HEAD').splitlines():
        path=Path(p)
        manifest.append({'path':p,'mode':'100755' if os.access(path,os.X_OK) else '100644','type':'blob','content':path.read_text()} if path.exists() else {'path':p,'mode':'100644','type':'blob','sha':None})
    (evidence/'source-files.json').write_text(json.dumps(manifest,ensure_ascii=False))
elif phase in ('db','server','app'):
    test(phase,plan[phase],phase)
elif phase == 'extra':
    for index,command in enumerate(plan.get('extra',[])):
        logged(shlex.split(command),f'extra-{index}.log')
elif phase == 'baseline':
    paths=plan.get('baselineRestore',[])
    fixed=git('rev-parse','HEAD')
    try:
        if paths: run(['git','restore',f"--source={plan.get('merge',plan['base'])}",'--worktree','--',*paths])
        for index,case in enumerate(plan.get('baseline',[])):
            name=f'baseline-{case["project"]}-{index}'
            status=test(case['project'],case['files'],name,case.get('filter',''),expected_failure=True)
            report=json.loads((evidence/f'{name}.json').read_text())
            assert status != 0 and report['numFailedTests'] > 0, (name,status)
            print(name,report['numFailedTests'],'expected original-code failures')
    finally:
        if paths: run(['git','restore',f'--source={fixed}','--worktree','--',*paths])
elif phase == 'typecheck':
    logged(['pnpm','type-check'],'typecheck.log')
elif phase == 'publish':
    run(['git','diff','--exit-code'])
    logged(['git','push','origin',f"HEAD:refs/heads/fix/audit-result-pr{plan['pr']}-{os.environ['GITHUB_RUN_ID']}"],'publish.log')
else:
    raise ValueError(phase)
