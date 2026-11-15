"""Preservation only: archive existing evidence; never run harness/checker code."""
import hashlib, json, os, stat, time, zipfile
from pathlib import Path

BASE = Path(r'C:\Users\User\.t3\worktrees\laughing-waffle-proto')
NAMES = ['t3-b6a8e362-4c1c21b30f50461f', 'perf-hillclimb-20261104', 'perf-hillclimb-phase-a--8335675f5d1dfbf0']
LIMIT = 5_000_000
SOURCE_SUFFIXES = {'.cs', '.ps1', '.py', '.mjs', '.js', '.ts', '.md', '.c', '.h', '.cpp', '.hpp', '.html', '.css'}

def sha256(file):
    h = hashlib.sha256()
    with file.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def preserve(name):
    tree = BASE / name
    roots = sorted((tree / 'artifacts').glob('perf-hillclimb*')) if (tree / 'artifacts').exists() else []
    archive = BASE / (name + '-performance-evidence-20261115.zip')
    if archive.exists(): raise RuntimeError('Archive already exists: ' + str(archive))
    files, directories, links = [], [], []
    for root in roots:
        if root.is_file(): files.append(root); continue
        for current, children, leaves in os.walk(root, followlinks=False):
            current = Path(current); directories.append(current)
            for child in children[:]:
                p = current / child
                if p.is_symlink() or p.is_junction(): links.append(p); children.remove(child)
            for leaf in leaves:
                p = current / leaf
                (links if p.is_symlink() else files).append(p)
    excluded, git_special, total, completed = [], [], 0, 0
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
        for d in directories:
            z.writestr(d.relative_to(tree).as_posix().rstrip('/') + '/', b'')
        for p in links:
            info = zipfile.ZipInfo(p.relative_to(tree).as_posix()); info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(info, os.readlink(p).encode('utf-8'))
        for p in files:
            before = p.stat(); relative = p.relative_to(tree).as_posix()
            z.write(p, relative)
            after = p.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise RuntimeError('Evidence changed during preservation: ' + str(p))
            total += before.st_size; completed += 1
            if before.st_size > LIMIT and p.suffix.lower() not in SOURCE_SUFFIXES:
                excluded.append({'path': relative, 'sizeBytes': before.st_size, 'sha256': sha256(p), 'reason': 'raw evidence exceeds 5 MB; full bytes in ZIP'})
            if '.git' in p.relative_to(tree).parts:
                git_special.append({'path': relative, 'sizeBytes': before.st_size, 'sha256': sha256(p), 'reason': 'Git metadata path cannot be stored as ordinary tracked content; full bytes in ZIP'})
            if completed % 3000 == 0: print(json.dumps({'worktree': name, 'archivedFiles': completed, 'rawBytes': total}), flush=True)
    with zipfile.ZipFile(archive) as z:
        if len([i for i in z.infolist() if not i.is_dir()]) != len(files) + len(links): raise RuntimeError('Archive entry inventory mismatch')
    manifest = {'schema': 1, 'purpose': 'Final preservation only; Phase A owned by Code Health; no acceptance or performance claim', 'worktree': str(tree), 'createdUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'rawThresholdBytes': LIMIT, 'evidenceRoots': [str(p.relative_to(tree)).replace('\\', '/') for p in roots], 'rawFileCount': len(files), 'rawBytes': total, 'linksStoredWithoutFollowing': len(links), 'excludedRawFiles': excluded, 'gitMetadataStoredOnlyInZip': git_special, 'zip': {'path': str(archive), 'sizeBytes': archive.stat().st_size, 'sha256': sha256(archive), 'fileCount': len(files) + len(links), 'complete': True}}
    destination = (tree if name != NAMES[2] else BASE / NAMES[0]) / 'docs/performance-preservation-20261115' / ('manifest.json' if name != NAMES[2] else 'cancelled-worktree-manifest.json')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('x', encoding='utf-8', newline='\n') as f: json.dump(manifest, f, indent=2); f.write('\n')
    selection = []
    omitted = {x['path'] for x in excluded + git_special}
    for p in files:
        relative = p.relative_to(tree).as_posix()
        if relative not in omitted: selection.append(relative)
    selection.extend(p.relative_to(tree).as_posix() for p in links)
    plan = {'worktree': str(tree), 'evidencePathsToStage': selection, 'excludedRawCount': len(excluded), 'gitSpecialCount': len(git_special), 'manifest': str(destination), 'zip': manifest['zip']}
    planfile = BASE / (name + '-preservation-selection-20261115.json')
    with planfile.open('x', encoding='utf-8') as f: json.dump(plan, f)
    print(json.dumps({'worktree': name, 'manifest': str(destination), 'zip': manifest['zip'], 'excludedRawCount': len(excluded), 'gitSpecialCount': len(git_special), 'stageEvidenceCount': len(selection)}), flush=True)
    return plan

if __name__ == '__main__':
    for name in NAMES: preserve(name)
