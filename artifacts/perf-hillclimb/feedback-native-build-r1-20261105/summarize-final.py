import collections
import json
from pathlib import Path

ROOT = Path('artifacts/perf-hillclimb')
MATRIX = ROOT / 'feedback-final-matrix-r2-20261105'
OUT = ROOT / 'feedback-native-build-r1-20261105'

def load(p):
    return json.loads(p.read_text(encoding='utf-8'))

def limits(values):
    values = [x for x in values if isinstance(x, (int, float))]
    return {'count': len(values), 'min': min(values) if values else None,
            'max': max(values) if values else None, 'sum': sum(values)}

plan = load(MATRIX / 'plan.json')
stages = load(MATRIX / 'results.json')
cells, rows, costs, life_costs, acknowledgements = [], [], [], [], []
identity_failures = []
for stage in stages:
    sid = next(x.split('=', 1)[1] for x in stage['argv'] if x.startswith('--id='))
    d = ROOT / sid
    if 'main-discovery' in ' '.join(stage['argv']):
        launched = load(d / 'results.json')
        scheduled = load(d / 'schedule.json')
        for leaf in launched:
            ld = ROOT / leaf['id']
            manifest = load(ld / 'manifest.json')
            errors = []
            for name, sha in manifest['harnessFiles'].items():
                if plan['sources'].get('scripts/perf-hillclimb/' + name) != sha:
                    errors.append('harness:' + name)
            for name, sha in manifest['servedAssets'].items():
                filename = plan['build'].get(name)
                if plan['assets'].get(filename) != sha:
                    errors.append('served:' + name)
            if manifest['measurementContractId'] != next(iter(
                {c['measurementContractId'] for c in cells}), manifest['measurementContractId']):
                errors.append('contract drift')
            cell = {**leaf, 'stage': stage['stage'], 'plannedStageCount': len(scheduled),
                    'buildId': manifest['buildId'], 'harnessId': manifest['harnessId'],
                    'measurementContractId': manifest['measurementContractId'],
                    'lifeAuthority': manifest.get('lifeAuthority'), 'identityErrors': errors}
            cells.append(cell)
            if errors:
                identity_failures.append({'id': leaf['id'], 'errors': errors})
    else:
        # Illustrated and J8 leaf identities/oracles remain in their untouched
        # own manifests/results; preserve their paths instead of normalizing.
        cells.append({'stage': stage['stage'], 'id': sid, 'exitCode': stage['exit'],
                      'measurementContractId': cells[0]['measurementContractId'],
                      'rawManifest': str(d / 'manifest.json'),
                      'rawResults': str(d / 'results.json')})

for d in ROOT.glob('feedback-final-matrix-r2-20261105-*'):
    p = d / 'observations.jsonl'
    if p.exists():
        for line in p.open(encoding='utf-8'):
            r = json.loads(line)
            f = r.get('feedback') or {}
            f = f.get('record') or f
            rows.append({'directory': d.name, 'job': r['job'], 'step': r['step'],
                         'ok': r.get('ok'), 'error': r.get('error'),
                         'feedbackPhase': f.get('phase'), 'feedbackError': f.get('error'),
                         'censor': f.get('censor'), 'markerAfterCompletion': f.get('markerAfterCompletion'),
                         'readCpuMs': f.get('readCpuMs'), 'collectionCpuMs': f.get('collectionCpuMs'),
                         'collectionWait': r.get('feedbackCollectionWindow')})
            ack = r.get('visibleSaveAcknowledgement')
            if ack:
                acknowledgements.append({'directory': d.name, 'step': r['step'],
                    'sampleCount': len(ack['samples']), 'overflow': ack['overflow'],
                    'firstVisibleSaving': ack['firstVisibleSaving'],
                    'firstVisibleSavedAfterNativeComplete': ack['firstVisibleSavedAfterNativeComplete'],
                    'nativeComplete': ack['nativeComplete'],
                    'readerCpuMs': limits([s['cpuMs'] for s in ack['samples']])})
    for p in d.glob('op-*-feedback.json'):
        x = load(p)
        costs.append({'path': str(p), 'hostRpcMs': x.get('hostRpcMs'),
                      'collectionWait': x.get('collectionWait')})
    for p in d.glob('*-life-*-cost.json'):
        life_costs.append({'path': str(p), **load(p)})

summary = {'phaseA': 'NOT SOUND', 'scope': 'representative construction; all failures retained; no tails/scoring/overhead acceptance',
    'stages': stages, 'cells': cells, 'identityFailures': identity_failures,
    'rowCount': len(rows), 'rows': rows,
    'feedbackPhases': dict(collections.Counter(x['feedbackPhase'] for x in rows)),
    'failedRows': [x for x in rows if x['ok'] is False],
    'censoredOrFailedFeedback': [x for x in rows if x['feedbackPhase'] not in ('completed', None)],
    'markerAfterCompletionCount': sum(x['markerAfterCompletion'] is True for x in rows),
    'feedbackReaderCpuMs': limits([x['readCpuMs'] for x in rows]),
    'feedbackCollectionCpuMs': limits([x['collectionCpuMs'] for x in rows]),
    'feedbackRpcMs': limits([x['hostRpcMs'] for x in costs]),
    'feedbackCosts': costs, 'lifeCosts': life_costs,
    'lifeReaderCpuMs': limits([x['readerCpuMs'] for x in life_costs]),
    'lifeRpcMs': limits([x['hostRpcMs'] for x in life_costs]),
    'saveAcknowledgements': acknowledgements,
    'sourceAfter': load(MATRIX / 'provenance-after.json')}
(OUT / 'matrix-r2-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps({k: summary[k] for k in ['rowCount','feedbackPhases','markerAfterCompletionCount','identityFailures','feedbackReaderCpuMs','feedbackCollectionCpuMs','feedbackRpcMs','lifeReaderCpuMs','lifeRpcMs','sourceAfter']}))
print('failed rows', len(summary['failedRows']), 'noncompleted feedback', len(summary['censoredOrFailedFeedback']))
