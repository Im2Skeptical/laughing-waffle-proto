"""Commit requested task files only; no checks, hooks, pushes, or branch changes."""
import json, os, subprocess, time
from pathlib import Path

BASE=Path(r'C:\Users\User\.t3\worktrees\laughing-waffle-proto')
NAMES=['perf-hillclimb-20261104','t3-b6a8e362-4c1c21b30f50461f']
HOOKS=BASE/'.preservation-empty-hooks-20261115'

def git(tree,*args,input=None):
    p=subprocess.run(['git','-c','core.autocrlf=false','-c','core.longpaths=true',*args],cwd=tree,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode: raise RuntimeError(p.stderr.decode('utf-8','replace')[:4000])
    return p.stdout

def paths(data): return [p.decode('utf-8') for p in data.split(b'\0') if p]

def preserve(name):
    tree=BASE/name; plan=json.loads((BASE/(name+'-preservation-selection-20261115.json')).read_text())
    expected='perf/hillclimb-20261104' if name==NAMES[0] else 't3/progress-performance-hillclimb'
    branch=git(tree,'branch','--show-current').decode().strip()
    if branch!=expected: raise RuntimeError('Wrong branch; no mutation: '+branch)
    normal=set(paths(git(tree,'diff','--name-only','-z','HEAD'))+paths(git(tree,'ls-files','--others','--exclude-standard','-z')))
    attributes=tree/'.gitattributes'
    if attributes.exists() and not attributes.read_text(encoding='utf-8').startswith('# Final performance preservation:'):
        raise RuntimeError('Existing unrelated attributes require preservation; no overwrite')
    # Keep task snapshots and evidence byte-exact in Git, including CRLF. Rules
    # affect only already-dirty task paths and the two requested evidence roots.
    rules=['# Final performance preservation: retain exact task/evidence bytes.', '/artifacts/perf-hillclimb/** -text','/artifacts/perf-hillclimb-*/** -text']
    for p in sorted(normal):
        if not p.startswith('artifacts/'):
            rules.append(json.dumps('/'+p,ensure_ascii=False)+' -text')
    attributes.write_text('\n'.join(rules)+'\n',encoding='utf-8')
    selected=normal|set(plan['evidencePathsToStage'])|{'.gitattributes'}
    excluded={x['path'] for x in json.loads(Path(plan['manifest']).read_text())['excludedRawFiles']}
    selected-=excluded
    pathspec=BASE/(name+'-preservation-stage-paths-20261115.nul')
    pathspec.write_bytes(b''.join(p.encode('utf-8')+b'\0' for p in sorted(selected)))
    git(tree,'--literal-pathspecs','add','--force','--pathspec-from-file='+str(pathspec),'--pathspec-file-nul')
    staged=paths(git(tree,'diff','--cached','--name-only','-z'))
    if not staged: raise RuntimeError('No preservation task files staged')
    if set(staged)&excluded: raise RuntimeError('Oversized raw evidence entered index')
    HOOKS.mkdir(exist_ok=True)
    env=os.environ.copy();env.update(GIT_AUTHOR_NAME='Im2Skeptical',GIT_AUTHOR_EMAIL='SOLOcan@gmail.com',GIT_COMMITTER_NAME='Im2Skeptical',GIT_COMMITTER_EMAIL='SOLOcan@gmail.com')
    log=BASE/(name+'-preservation-commit-20261115.log')
    with log.open('xb') as out:
        p=subprocess.run(['git','-c','core.autocrlf=false','-c','core.longpaths=true','-c','core.hooksPath='+str(HOOKS),'-c','commit.gpgsign=false','commit','-m','chore(perf): preserve stopped hillclimb for Code Health handoff'],cwd=tree,env=env,stdout=out,stderr=subprocess.STDOUT)
    if p.returncode: raise RuntimeError('Commit failed; see '+str(log))
    tip=git(tree,'rev-parse','HEAD').decode().strip(); total=len(paths(git(tree,'ls-files','-z')))
    receipt={'worktree':str(tree),'localBranch':branch,'tip':tip,'committedFileCount':len(staged),'trackedFileCountAtTip':total,'excludedRawFiles':plan['excludedRawCount'],'author':git(tree,'show','-s','--format=%an <%ae> | %cn <%ce>','HEAD').decode().strip(),'commitLog':str(log),'manifest':plan['manifest'],'zip':plan['zip']}
    destination=BASE/(name+'-preservation-commit-receipt-20261115.json')
    with destination.open('x',encoding='utf-8') as f: json.dump(receipt,f,indent=2)
    print(json.dumps(receipt),flush=True)

if __name__=='__main__':
    for n in NAMES: preserve(n)
