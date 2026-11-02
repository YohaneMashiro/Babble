#!/usr/bin/env python3
"""MIT audit: validate every benchmark member/range against pinned Unicode bytes."""
import json,hashlib,re,zipfile
from pathlib import Path
HERE=Path('/root/.cache/babble-coverage-next/reading-policy');BASE=Path('/root/.cache/babble-coverage-research/benchmarks');ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn')
def pin(p):
 b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
r=json.loads((BASE/'repertoires.json').read_text());zpath=BASE/'Unihan-17.0.0.zip';assert pin(zpath)['sha256']==r['sha256'];expected={k:[] for k in r['properties']};members=[]
with zipfile.ZipFile(zpath) as z:
 for name in ['Unihan_OtherMappings.txt']:
  b=z.read(name);members.append({'name':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
  for line in b.decode().splitlines():
   if not line or line.startswith('#'):continue
   cp,prop,val=line.split('\t')
   if prop in expected:expected[prop].append({'char':chr(int(cp[2:],16)),'value':val})
assert expected==r['properties']
targets=json.loads((ROOT/'data/unicode-targets.json').read_text());sources=[]
for v in targets['versions']:
 p=BASE/('PropList-'+v['version']+'.txt');assert pin(p)['sha256']==v['sourceSha256'];actual=set()
 for line in p.read_text().splitlines():
  m=re.match(r'^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*Unified_Ideograph\b',line)
  if m:actual.update(range(int(m[1],16),int(m[2]or m[1],16)+1))
 wanted={cp for a,b in v['ranges']for cp in range(int(a,16),int(b,16)+1)};assert actual==wanted;assert len(actual)==v['count'];sources.append(pin(p))
report={'schemaVersion':1,'repertoiresMatchPinnedArchive':True,'unicodeTargetsMatchPinnedPropertyLists':True,'archive':pin(zpath),'members':members,'benchmarks':pin(BASE/'repertoires.json'),'propertyLists':sources,'localTargets':pin(ROOT/'data/unicode-targets.json'),'program':pin(Path(__file__))}
(HERE/'benchmark-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'repertoiresMatchPinnedArchive':True,'unicodeTargetsMatchPinnedPropertyLists':True,'memberCount':len(members)}))
