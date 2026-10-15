#!/usr/bin/env python3
"""Root-only serial resource guard; preserves logs and closes only proven children."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

MIB = 1024 * 1024
CGROUP = Path('/sys/fs/cgroup')
ROOT = Path('/workspace/orvilo1')

def atomic(path, value):
    temporary = path.with_suffix(path.suffix + '.new')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)

def proc_identity(pid):
    try:
        text = Path(f'/proc/{pid}/stat').read_text()
        fields = text[text.rfind(')') + 2:].split()
        return {'pid': pid, 'ppid': int(fields[1]), 'startTicks': int(fields[19]), 'state': fields[0]}
    except (FileNotFoundError, ProcessLookupError, PermissionError, ValueError):
        return None

def processes():
    result = {}
    for entry in Path('/proc').iterdir():
        if entry.name.isdigit():
            actual = proc_identity(int(entry.name))
            if actual:
                result[actual['pid']] = actual
    return result

def disk_free(directory):
    stat = os.statvfs(directory)
    return stat.f_bavail * stat.f_frsize

def resources():
    memory = int((CGROUP / 'memory.current').read_text())
    maximum = (CGROUP / 'memory.max').read_text().strip()
    if maximum == 'max':
        available = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))) * 1024
    else:
        available = int(maximum) - memory
    events = {}
    for line in (CGROUP / 'memory.events').read_text().splitlines():
        key, value = line.split()
        events[key] = int(value)
    return {'memoryCurrent': memory, 'memoryHeadroom': available, 'tmpFree': disk_free('/tmp'),
            'workspaceFree': disk_free('/workspace'), 'memoryEvents': events}

def allocated(directory):
    result = 0
    for current, folders, files in os.walk(directory, followlinks=False):
        folders[:] = [name for name in folders if not (Path(current) / name).is_symlink()]
        for name in files:
            try:
                info = (Path(current) / name).lstat()
                result += info.st_blocks * 512
            except FileNotFoundError:
                pass
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--node', required=True)
    parser.add_argument('--script', required=True)
    parser.add_argument('--tool-args', nargs=argparse.REMAINDER, default=[])
    parser.add_argument('--head', required=True)
    parser.add_argument('--lease', required=True)
    parser.add_argument('--scope', default='compiled-tool')
    parser.add_argument('--workspace-floor-mib', type=int, default=48)
    parser.add_argument('--port', type=int, default=5179)
    args = parser.parse_args()
    if args.workspace_floor_mib != 48:
        raise RuntimeError('Do not lower the retained 48MiB Workspace guard')
    directory = Path(__file__).resolve().parent
    if args.output.exists():
        raise RuntimeError('Use a fresh actual output directory; never overwrite evidence')
    if not Path(args.node).is_file() or not Path(args.script).is_file():
        raise RuntimeError('Root must supply genuine installed Node and exact tool script paths')
    initial = resources()
    if initial['memoryHeadroom'] < 3528114005 or initial['tmpFree'] < 620756992 or initial['workspaceFree'] < 48 * MIB:
        raise RuntimeError('Original Native admission reserves unmet: ' + json.dumps(initial))
    args.output.mkdir(mode=0o700, parents=True)
    atomic(args.output / 'resource-admission.json', initial)
    harness_inputs = {file.name: {'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'bytes': file.stat().st_size}
                      for file in directory.iterdir() if file.is_file() and file.name != 'css-entry.ts'}
    atomic(args.output / 'frozen-harness-inputs.json', harness_inputs)
    before_head = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    if before_head != args.head:
        raise RuntimeError('Actual Root head differs from caller-bound acceptance head')
    before_status = subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain=v1'], text=True)
    if before_status.strip():
        raise RuntimeError('Actual Root must be clean before acceptance; preserve pending work before running')
    subreaper = ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0)
    if subreaper != 0 or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise RuntimeError('Actual Linux subreaper and PIDFD closure are required')
    inherited = dict(os.environ)
    inherited.update({'ROOT_HEAVY_LEASE': args.lease, 'NODE_OPTIONS': '--max-old-space-size=2048', 'RAYON_NUM_THREADS': '1'})
    tool_hash = hashlib.sha256(Path(args.script).read_bytes()).hexdigest()
    # Do not copy environment secrets into evidence. The original environment
    # remains inherited solely to run installed tools and the X display.
    known = {}
    pidfds = {}
    failures = []
    closure = []
    started = time.monotonic()
    snapshots = []
    root_pid = os.getpid()
    child = None
    stdout = (args.output / 'stdout.log').open('wb')
    stderr = (args.output / 'stderr.log').open('wb')
    exit_code = None

    def discover():
        live = processes()
        accepted = {root_pid, *known.keys()}
        changed = True
        while changed:
            changed = False
            for pid, item in live.items():
                if pid == root_pid or pid in known or item['ppid'] not in accepted:
                    continue
                if item['ppid'] in known and live.get(item['ppid'], {}).get('startTicks') != known[item['ppid']]['startTicks']:
                    continue
                known[pid] = item
                accepted.add(pid)
                try:
                    pidfds[pid] = os.pidfd_open(pid)
                except ProcessLookupError:
                    pass
                changed = True
        return live

    def close_signal(which):
        live = discover()
        for pid, original in list(known.items())[::-1]:
            actual = live.get(pid)
            if not actual or actual['startTicks'] != original['startTicks'] or actual['state'] == 'Z':
                continue
            fd = pidfds.get(pid)
            if fd is None:
                failures.append('Proven child lacks PIDFD: ' + str(pid))
                continue
            try:
                signal.pidfd_send_signal(fd, which)
                closure.append({'pid': pid, 'startTicks': original['startTicks'], 'signal': which})
            except ProcessLookupError:
                pass

    try:
        child = subprocess.Popen([args.node, args.script, *args.tool_args], cwd=directory,
                                 env=inherited, stdout=stdout, stderr=stderr, start_new_session=True)
        item = proc_identity(child.pid)
        if item:
            known[child.pid] = item
            pidfds[child.pid] = os.pidfd_open(child.pid)
        while child.poll() is None:
            discover()
            current = resources()
            current['elapsedSeconds'] = time.monotonic() - started
            current['artifactAllocatedBytes'] = allocated(args.output)
            snapshots.append(current)
            atomic(args.output / 'resource-live.json', current)
            if current['memoryHeadroom'] < 256 * MIB or current['tmpFree'] < 80 * MIB or current['workspaceFree'] < 48 * MIB:
                failures.append('Original live memory/Tmp/Workspace reserve breached')
                break
            if current['artifactAllocatedBytes'] > 1024 * MIB:
                failures.append('1GiB fixture output cap breached')
                break
            if current['elapsedSeconds'] >= 480:
                failures.append('Original480second Native deadline breached')
                break
            if any(current['memoryEvents'][key] > initial['memoryEvents'].get(key, 0) for key in ['oom', 'oom_kill', 'max']):
                failures.append('Cgroup memory event increased')
                break
            time.sleep(1)
        if failures:
            close_signal(signal.SIGTERM)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                close_signal(signal.SIGKILL)
        exit_code = child.wait(timeout=10)
    except BaseException as error:
        failures.append(type(error).__name__ + ': ' + str(error))
    finally:
        close_signal(signal.SIGTERM)
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            live = discover()
            active = [pid for pid, old in known.items() if pid in live and live[pid]['startTicks'] == old['startTicks'] and live[pid]['state'] != 'Z']
            if not active:
                break
            time.sleep(0.1)
        close_signal(signal.SIGKILL)
        # Reap only children adopted through this wrapper's actual subreaper.
        while True:
            try:
                pid, _ = os.waitpid(-1, os.WNOHANG)
                if pid == 0:
                    break
            except ChildProcessError:
                break
        live = discover()
        leftovers = [old for pid, old in known.items() if pid in live and live[pid]['startTicks'] == old['startTicks'] and live[pid]['state'] != 'Z']
        if leftovers:
            failures.append('Known-owned process remains alive')
        for fd in pidfds.values():
            os.close(fd)
        stdout.close()
        stderr.close()
        final = resources()
        events = {key: final['memoryEvents'][key] - initial['memoryEvents'].get(key, 0) for key in final['memoryEvents']}
        if any(events.get(key, 0) for key in ['oom', 'oom_kill', 'max']):
            failures.append('Memory events nonzero at closure')
        status = subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain=v1'], text=True)
        head = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
        if head != before_head or status != before_status:
            failures.append('Root revision/status changed during acceptance')
        for name, original in harness_inputs.items():
            file = directory / name
            if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != original['sha256']:
                failures.append('Acceptance harness source changed during run: ' + name)
        if hashlib.sha256(Path(args.script).read_bytes()).hexdigest() != tool_hash:
            failures.append('Actual tool source changed during execution')
        runtime_path = args.output / 'tool-result' / 'summary.json'
        accepted = exit_code == 0 and not failures
        atomic(args.output / 'execution.json', {'schema': 'root-real-compiled-tool-resource-wrapper-v1', 'actualToolScript': args.script, 'actualToolScriptSHA256': tool_hash, 'lease': args.lease,
          'head': head, 'scope': args.scope, 'exitCode': exit_code, 'passed': bool(accepted), 'runtimeReportSHA256': hashlib.sha256(runtime_path.read_bytes()).hexdigest() if runtime_path.exists() else None,
          'failures': failures, 'initial': initial, 'final': final, 'memoryEventsDelta': events,
          'elapsedSeconds': time.monotonic() - started, 'artifactAllocatedBytes': allocated(args.output),
          'artifactCapBytes': 1024 * MIB,
          'knownOwned': list(known.values()), 'knownOwnedClosure': not leftovers, 'closureSignals': closure,
          'unknownProcessBoundary': 'No claim about unrelated processes; signals use proven birth identity and PIDFD only.',
          'electronExecuted': False, 'scopeBoundary': 'Actual tool exit and resource/source closure only; inspect the tool original result for proven scope.'})
        atomic(args.output / 'resource-history.json', snapshots)
    return 0 if accepted else 1

if __name__ == '__main__':
    raise SystemExit(main())
