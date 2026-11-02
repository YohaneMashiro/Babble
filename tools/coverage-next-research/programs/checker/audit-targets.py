from pathlib import Path
import json,re,zipfile,hashlib
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');BASE=Path('/root/.cache/babble-coverage-next');OUT=BASE/'checker'
def unified(version):
 p=Path('/root/.cache/babble-coverage-research/benchmarks')/('PropList-'+version+'.txt');out=set()
 for line in p.read_text().splitlines():
  body=line.split('#')[0].strip()
  if not body:continue
  rr,prop=map(str.strip,body.split(';'))
  if prop!='Unified_Ideograph':continue
  vals=rr.split('..');out.update(chr(i) for i in range(int(vals[0],16),int(vals[-1],16)+1))
 return out,hashlib.sha256(p.read_bytes()).hexdigest()
uni17,sha17=unified('17.0.0');uni18,sha18=unified('18.0.0');assert len(uni17)==101996 and len(uni18)==101997
reps={k:set() for k in ['kTGH','kGB0','kBigFive']}
with zipfile.ZipFile('/root/.cache/babble-coverage-research/benchmarks/Unihan-17.0.0.zip') as z:
 for name in z.namelist():
  if not name.endswith('.txt'):continue
  for line in z.read(name).decode().splitlines():
   if not line or line.startswith('#'):continue
   cp,prop,v=line.split('\t')
   if prop in reps:reps[prop].add(chr(int(cp[2:],16)))
four=set(json.loads((OUT/'production-four-characters.json').read_text()))
ref=set()
for line in Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml').read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
ix=json.loads(Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json').read_text());officialfour={c for c,v in ix.items() if any(re.fullmatch('[a-zA-Z]{4}[-+*]*',x) for x in v['1'].split())};known={c for c,k in ref}|officialfour
def reading(pid):
 j=json.loads((BASE/'reading-policy'/(pid+'.candidates.json')).read_text());return {(r[0],r[1]) for r in j['rows']}
stages={'baseline':reading('baseline'),'reading-modern':reading('union-modern'),'reading-all':reading('union-all')}
decomp={tuple(x) for x in json.loads((OUT/'decomposition-actual-exact-pairs.json').read_text())}
stages['decomposition-fixed-reading']=decomp;stages['reading-all-plus-decomposition-fixed']=stages['reading-all']|decomp
for label,file in [('interaction-untagged','interaction-actual-exact-pairs.json'),('final-tagged-interaction','final-actual-exact-pairs.json'),('equivalent-glyph-transfer','equivalent-transfer-actual-exact-pairs.json'),('without-cjkvi','without-cjkvi-actual-exact-pairs.json')]:
 if (OUT/file).exists():stages[label]={tuple(x) for x in json.loads((OUT/file).read_text())}
finite=set()
if (OUT/'common-finite-independent-audit.json').exists():
 common=json.loads((OUT/'common-finite-independent-audit.json').read_text());finite={r['char'] for r in common['codeComparison'] if r['exact'] and not r['contextHeld']};stages['with-reviewed-finite-endpoints']=stages['equivalent-glyph-transfer']
 if 'without-cjkvi' in stages:stages['without-cjkvi-with-reviewed-finite-endpoints']=stages['without-cjkvi']
hy=[c for c in (ROOT/'the_Tower_of_Babel.txt').read_text() if c in uni18];assert len(hy)==1840
results={}
for key,candidates in stages.items():
 exact=candidates&ref;chars={c for c,k in exact};stagefour=four|finite if 'with-reviewed-finite-endpoints' in key else four;union=stagefour|chars;missing={c:hy.count(c) for c in dict.fromkeys(hy) if c not in union}
 results[key]={'exactCharacters':len(chars),'exactPairs':len(exact),'fourAndExactCharacters':len(union),'knownOfficialMissing':len(known-union),'unicode17Covered':len(uni17&union),'unicode18Covered':len(uni18&union),'unicode18Missing':len(uni18-union),'outsideUnicode18':''.join(sorted(union-uni18,key=ord)),'hyCoveredOccurrences':sum(c in union for c in hy),'hyMissing':missing,'repertoires':{k:{'total':len(v),'covered':len(v&union),'missing':len(v-union)} for k,v in reps.items()}}
def flatkeys(paths):
 keys=set()
 for p in paths:
  for line in p.read_text().splitlines():
   if not line or line.startswith('#'):continue
   f=line.split('\t')
   if len(f)>1 and len(f[0])==1:keys.add(f[0])
 return keys
def idskeys(paths,yi=False):
 keys=set()
 for p in paths:
  for line in p.read_text().splitlines():
   if not line or line.startswith(('#',';')):continue
   f=line.split('\t');i=0 if yi else 1
   if len(f)>i+1 and len(f[i])==1:keys.add(f[i])
 return keys
sources={
 'radical':flatkeys([ROOT/'tools/component-spelling/inputs/radical.yaml']),
 'oldYi':idskeys([ROOT/'tools/libre-flypy-audit/inputs/ids_lv2.txt'],True),
 'oldChaizi':flatkeys([ROOT/'tools/shape-expansion/inputs/chaizi-jt.txt',ROOT/'tools/shape-expansion/inputs/chaizi-ft.txt']),
 'newYi':idskeys([BASE/'decomposition/sources/yi-bai--ids/ids_lv2.txt'],True),
 'newCHISE':idskeys(list((BASE/'decomposition/sources/chise--ids').glob('IDS-UCS*.txt'))),
 'CJKVI':idskeys([BASE/'decomposition/sources/cjkvi--cjkvi-ids/ids.txt',BASE/'decomposition/sources/cjkvi--cjkvi-ids/ids-ext-cdef.txt']),
 'newChaizi':flatkeys([BASE/'decomposition/sources/henrysting--chaizi/chaizi-jt.txt',BASE/'decomposition/sources/henrysting--chaizi/chaizi-ft.txt'])}
old=sources['radical']|sources['oldYi']|sources['oldChaizi'];allkeys=set().union(*sources.values())
sourcecounts={k:{'keys':len(v),'unicode18TargetKeys':len(v&uni18),'outsideOldUnion':len(v-old),'outsideOldUnionInUnicode18':len((v-old)&uni18)} for k,v in sources.items()}
sourcecounts['oldUnion']={'keys':len(old),'unicode18TargetKeys':len(old&uni18)};sourcecounts['allUnion']={'keys':len(allkeys),'unicode18TargetKeys':len(allkeys&uni18),'unicode18TargetWithoutSourceKeys':len(uni18-allkeys)}
out={'unicode17':{'total':len(uni17),'sha256':sha17},'unicode18':{'total':len(uni18),'sha256':sha18},'sourceKeySets':sourcecounts,'stages':results}
(OUT/'target-union-independent-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2))
