from pathlib import Path
import tarfile,hashlib,json
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');OUT=Path('/root/.cache/babble-coverage-next/checker')
archive=ROOT/'dist/source/babble-source.tgz';rows=[];changed=[];members=set()
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='b754cb1b91e56e5178130c74fbd12c7c9731e83213b65f5c730b9e729d0ac9ef'
with tarfile.open(archive) as t:
 for m in t.getmembers():
  if not m.isfile():continue
  members.add(m.name);b=t.extractfile(m).read();p=ROOT/m.name;equal=p.is_file() and p.read_bytes()==b
  rows.append({'path':m.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'currentEqual':equal})
  if not equal:changed.append(m.name)
added=[]
for prefix in ['src','data','tests','tools','scripts']:
 for p in (ROOT/prefix).rglob('*'):
  if p.is_file() and p.relative_to(ROOT).as_posix() not in members:added.append(p.relative_to(ROOT).as_posix())
js=ROOT/'dist/assets/index-C31KOCG5.js';jssha=hashlib.sha256(js.read_bytes()).hexdigest();assert jssha=='3455bd16b21c1ae62dc9d5e9b4a4cc4397973182765f6c4097942a5f6cdfa65d'
cachefiles=[p for p in added if '/__pycache__/' in p and p.endswith('.pyc')]
added=[p for p in added if p not in cachefiles]
out={'baselineArchiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':rows,'allChanged':changed,'changedOutsideDocs':[p for p in changed if not p.startswith('docs/')],'addedCodeOrDataFiles':added,'excludedPythonCacheFiles':cachefiles,'productionJsSha256':jssha}
assert not out['changedOutsideDocs'] and not added
(OUT/'archive-production-snapshot-audit.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k!='files'}));print('baselineFiles',len(rows))
