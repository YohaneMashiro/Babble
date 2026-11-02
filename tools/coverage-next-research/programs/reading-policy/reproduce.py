#!/usr/bin/env python3
"""MIT wrapper. Verify source pins and byte-for-byte candidate-first rerun."""
import hashlib,json,subprocess,os
from pathlib import Path
HERE=Path('/root/.cache/babble-coverage-next/reading-policy')
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn')
def digest(p):
 b=Path(p).read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def load(p):return json.loads(Path(p).read_text())
m=load(HERE/'generation-manifest.json')
inputs=m['sourceFiles']+m['inputs']+[m['unihan']]
for pin in inputs:
 actual=digest(pin['path']);assert actual['sha256']==pin['sha256'],pin['path']
 if 'bytes'in pin:assert actual['bytes']==pin['bytes'],pin['path']
files=['generation-manifest.json','summary.json']+[x['file'] for x in m['generated']]+[p['id']+'.comparison.json' for p in m['policies']]
before={n:digest(HERE/n) for n in files}
subprocess.run(['python3',str(HERE/'extract.py'),str(HERE/'unihan17-properties.reproduced.json')],check=True,stdout=subprocess.DEVNULL)
assert digest(HERE/'unihan17-properties.reproduced.json')==digest(HERE/'unihan17-properties.json')
env={**os.environ,'PATH':'/root/.local/share/xiaohe-toolchain/current/bin:'+os.environ['PATH']}
for arg,log in [('--generate','reproduction-generation.log'),('--compare','reproduction-comparison.log')]:
 with (HERE/log).open('w') as out:subprocess.run(['node',str(HERE/'run.mjs'),arg],env=env,cwd=ROOT,check=True,stdout=out,stderr=subprocess.STDOUT)
 if arg=='--generate':
  regenerated=load(HERE/'generation-manifest.json');assert regenerated['comparisonOpened'] is False
  for pin in regenerated['generated']:assert digest(HERE/pin['file'])==before[pin['file']],pin['file']
  before_comparison_hashes={x['file']:digest(HERE/x['file']) for x in regenerated['generated']}
after={n:digest(HERE/n) for n in files}
assert before==after,[n for n in files if before[n]!=after[n]]
report={'schemaVersion':1,'method':'Verified every recorded source/input pin, reproduced Unicode extraction, regenerated all16 candidate policies and verified hashes before starting comparator process, reran comparator; every listed output byte-identical to initial artifact.','generator':digest(HERE/'run.mjs'),'extractor':digest(HERE/'extract.py'),'verificationProgram':digest(__file__),'verifiedInputCount':len(inputs),'extractionMatches':True,'candidateHashesRecordedBeforeComparator':before_comparison_hashes,'verifiedArtifacts':after,'allArtifactsByteIdentical':True,'scope':'Reproduction of frozen research policies, not product adoption or independent linguistic correctness.'}
(HERE/'reproduction.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verifiedInputCount':len(inputs),'verifiedArtifactCount':len(after),'candidateArtifactsBeforeComparator':len(before_comparison_hashes),'allArtifactsByteIdentical':True}))
