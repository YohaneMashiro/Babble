#!/usr/bin/env python3
"""Diagnostics only: fixed alphabet rotation of the final component code.
Generate complete control corpora before any reference is read by this program.
These counterfactual codes are never source-supported candidates or product data.
"""
from pathlib import Path
import json,hashlib,sys
O=Path('/root/.cache/babble-coverage-next/decomposition/leaf-expansion');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if sys.argv[1]=='--generate':
 prereg={'scope':'Diagnostics-only negative control, not a candidate policy','operation':'Rotate EACH uppercase ASCII letter of the final two-letter component code by one, Z→A; preserve target character and preceding chunks. Apply uniformly to all rows of both frozen leaf corpora. No reference reads.','generatorSha256':sha(Path(__file__)),'comparisonOpened':False}
 (O/'negative-control-preregistration.json').write_text(json.dumps(prereg,indent=2)+'\n');pins=[]
 for p in [O,O/'no-cjkvi']:
  g=json.loads((p/'generation-summary.json').read_text());source=p/'candidates.jsonl';assert sha(source)==g['artifacts'][1]['sha256']
  target=p/'negative-control-candidates.jsonl';seen=set()
  with target.open('w') as out:
   for l in source.open():
    r=json.loads(l);code=r['code'];assert len(code)==8
    last=''.join(chr((ord(c)-65+1)%26+65) for c in code[-2:]);key=(r['char'],code[:-2]+last)
    if key in seen:continue
    seen.add(key);out.write(json.dumps(key,ensure_ascii=False,separators=(',',':'))+'\n')
  pins.append({'path':str(target),'sha256':sha(target),'rows':len(seen),'sourceSha256':sha(source)})
 (O/'negative-control-generation.json').write_text(json.dumps({'preregistrationSha256':sha(O/'negative-control-preregistration.json'),'generatedWithoutComparator':True,'artifacts':pins},indent=2)+'\n')
elif sys.argv[1]=='--compare':
 g=json.loads((O/'negative-control-generation.json').read_text());assert g['generatedWithoutComparator']
 for pin in g['artifacts']:assert sha(Path(pin['path']))==pin['sha256']
 rp=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml');assert sha(rp)=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
 ref=set()
 for l in rp.read_text().splitlines():
  f=l.split('\t')
  if len(f)>1:ref.add((f[0],f[1].upper()))
 result=[]
 for pin in g['artifacts']:
  pairs=set()
  for l in Path(pin['path']).open():
   r=json.loads(l);p=tuple(r)
   if p in ref:pairs.add(p)
  result.append({'file':pin['path'],'rows':pin['rows'],'exactChars':len({c for c,k in pairs}),'exactPairs':len(pairs),'scope':'Accidental mirror agreement after counterfactual code rotation; never usable code evidence'})
 (O/'negative-control-comparison.json').write_text(json.dumps({'generationSha256':sha(O/'negative-control-generation.json'),'result':result},indent=2)+'\n');print(json.dumps(result,indent=2))
else:raise SystemExit('Use --generate then --compare')
