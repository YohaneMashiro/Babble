from pathlib import Path
from collections import defaultdict
import json,hashlib
O=Path('/root/.cache/babble-coverage-next/decomposition/leaf-expansion');rows=json.loads((O/'source-cut-catalog.json').read_text());ix=defaultdict(list)
for r in rows:ix[r['sourceRecord']['char']].append(r)
reject=[]
for outer in rows:
 r=outer['sourceRecord'];parent=tuple(r['parts']);c=r['char']
 if c in parent:continue
 found=set();overflow=False
 for pos,p in enumerate(parent):
  for inner in ix[p]:
   children=tuple(inner['sourceRecord']['parts'])
   if p in children or c in children:continue
   found.add(parent[:pos]+children+parent[pos+1:])
   if len(found)>4096:overflow=True;break
  if overflow:break
 if overflow:reject.append({'outerCutId':outer['id'],'char':c,'parts':parent,'sourceWitness':r,'observedAtLeast':len(found)})
assert len(reject)==0
(O/'structural-cap-rejections.json').write_text(json.dumps({'policy':'Reject complete outer cut if more than4096distinctone-leafexpansions; never truncateaccept','rejectedCuts':len(reject),'characters':len({r['char'] for r in reject}),'rows':reject},ensure_ascii=False,indent=2)+'\n');print('cap rejections',len(reject),'chars',len({r['char'] for r in reject}))
