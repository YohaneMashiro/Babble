#!/usr/bin/env python3
"""MIT wrapper; sequential candidate-first frozen experiment reproduction."""
from pathlib import Path
import hashlib,json,subprocess
HERE=Path('/root/.cache/babble-coverage-next/reading-policy/equivalent-glyph-transfer')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
gen=json.loads((HERE/'generation-manifest.json').read_text());names=[Path(x['path']).name for x in gen['generated']]+['preregistration.json','generation-manifest.json','comparison-summary.json','raw-transferred.new-exact-witnesses.json','joint-transferred.new-exact-witnesses.json'];before={n:sha(HERE/n)for n in names}
for mode in ['--generate','--compare']:
 with(HERE/('reproduction-'+mode[2:]+'.log')).open('w')as out:subprocess.run(['python3',str(HERE/'run.py'),mode],stdout=out,stderr=subprocess.STDOUT,check=True)
 if mode=='--generate':
  assert all(sha(x['path'])==x['sha256']for x in gen['generated'])
  beforecomparison={str(x['path']):sha(x['path'])for x in gen['generated']}
after={n:sha(HERE/n)for n in names};assert before==after
report={'schemaVersion':1,'programSha256':sha(HERE/'run.py'),'verificationProgramSha256':sha(__file__),'candidateHashesRecordedBeforeComparator':beforecomparison,'allArtifactsByteIdentical':True,'verifiedArtifactCount':len(names),'artifacts':after}
(HERE/'reproduction.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'allArtifactsByteIdentical':True,'verifiedArtifactCount':len(names)}))
