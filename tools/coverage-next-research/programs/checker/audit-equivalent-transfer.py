from pathlib import Path
import json,hashlib,re,itertools,collections,math,copy
HERE=Path('/root/.cache/babble-coverage-next/reading-policy/equivalent-glyph-transfer');OUT=Path('/root/.cache/babble-coverage-next/checker');ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn')
def digest(p):
 p=Path(p);h=hashlib.sha256()
 with p.open('rb') as stream:
  for b in iter(lambda:stream.read(1024*1024),b''):h.update(b)
 return {'path':str(p),'bytes':p.stat().st_size,'sha256':h.hexdigest()}
prereg=json.loads((HERE/'preregistration.json').read_text());gen=json.loads((HERE/'generation-manifest.json').read_text());claim=json.loads((HERE/'comparison-summary.json').read_text())
assert prereg['comparisonOpened'] is False and gen['comparisonOpened'] is False and gen['generatedWithoutComparator'] and prereg['preregisteredBeforeGeneration']
assert digest(HERE/'run.py')==prereg['generator']==gen['generator']
for pin in prereg['inputs']+gen['generated']:assert digest(pin['path'])==pin
base=json.loads((HERE.parent/'union-all-component-choices.json').read_text());expected=copy.deepcopy(base);mapping=[];added=0;newparts=[];unavailable=[]
source=ROOT/'tools/shape-expansion/inputs/EquivalentUnifiedIdeograph.txt';pin=digest(source)
for no,line in enumerate(source.read_text().splitlines(),1):
 body=line.split('#')[0].strip()
 if not body:continue
 cp,target=map(str.strip,body.split(';'));rr=cp.split('..');mapped=chr(int(target,16))
 for n in range(int(rr[0],16),int(rr[-1],16)+1):
  part=chr(n);m={'originalPart':part,'mappedUnifiedChar':mapped,'sourcePath':str(source),'sourceSha256':pin['sha256'],'sourceLine':no,'rawLine':line};mapping.append(m)
  if mapped not in base:unavailable.append(part);continue
  if part not in base:newparts.append(part)
  options={c['code']:c for c in expected.get(part,[])}
  for c in base[mapped]:
   e={'pinyin':c['pinyin'],'source':'equivalent-glyph mnemonic transfer','mapping':m,'targetCode':c['code'],'targetEvidence':c['evidence']}
   if c['code'] not in options:options[c['code']]={'part':part,'pinyin':c['pinyin'],'code':c['code'],'sourceId':'equivalent-glyph mnemonic transfer','evidence':[]};added+=1
   options[c['code']]['evidence'].append(e)
  expected[part]=list(options.values())
actual=json.loads((HERE/'transferred-component-choices.json').read_text());assert actual==expected
mw=json.loads((HERE/'mapping-witnesses.json').read_text());assert mw=={'mappings':mapping,'targetsWithoutBroadChoices':unavailable,'newReadableParts':newparts,'addedComponentCodeChoices':added}
catalog=json.loads((HERE/'component-catalog.json').read_text());rowfiles={}
rawpath=ROOT/'tools/component-spelling/inputs/radical.yaml'
def rawrows():
 for no,line in enumerate(rawpath.read_text().splitlines(),1):
  if line and not line.startswith('#'):
   c,ps=line.split('\t');yield c,ps.split(),str(rawpath),no
structpaths=[Path(p['path']) for p in prereg['inputs'] if p['path'].endswith('structural-rows.jsonl')]
def allrows():
 yield from rawrows()
 for p in structpaths:
  for no,line in enumerate(p.open(),1):
   r=json.loads(line);yield r['char'],r['parts'],str(p),no
results={};sets={}
for name in prereg['plannedCorpora']:
 choices=base if name.endswith('original') else actual;rows=rawrows if name.startswith('raw') else allrows
 candidates=set();witnesses={};counter=collections.Counter();maxcomb=0
 for char,parts,path,no in rows():
  counter['sourceRows']+=1
  if len(parts) not in (2,3) or any(len(p)!=1 or 0xd800<=ord(p)<=0xdfff for p in parts):counter['rejectedPartCountOrScalar']+=1;continue
  opts=[choices.get(p,[]) for p in parts]
  if any(not v for v in opts):counter['rejectedMissingChoices']+=1;continue
  combos=math.prod(map(len,opts));maxcomb=max(maxcomb,combos)
  if combos>256:counter['rejectedCombinationBound']+=1;continue
  counter['eligibleSourceRows']+=1
  for options in itertools.product(*opts):
   pair=(char,'OK'+''.join(c['code'] for c in options))
   if pair not in candidates:candidates.add(pair);witnesses[pair]=(parts,path,no)
 actualpairs=set()
 for line in (HERE/(name+'.candidates.jsonl')).open():
  char,code,parts,ids,w,transfer=json.loads(line);pair=(char,code)
  assert pair not in actualpairs;actualpairs.add(pair)
  assert witnesses[pair]==(parts,w['path'],w['line'])
  components=[catalog[i] for i in ids];assert [c['part'] for c in components]==parts and code=='OK'+''.join(c['code'] for c in components)
  for part,c in zip(parts,components):assert c in choices[part]
  assert transfer==any(c['code'] not in {x['code'] for x in base.get(p,[])} for p,c in zip(parts,components))
 assert candidates==actualpairs
 s=gen['statistics'][name];assert s['candidatePairs']==len(candidates) and s['maximumCombinations']==maxcomb
 for k,v in counter.items():assert s.get(k,0)==v
 sets[name]=candidates;results[name]={'completeIndependentGenerationEqual':True,'allFirstWitnessesAndCatalogEvidenceVerified':True,'candidatePairs':len(candidates),'candidateCharacters':len({c for c,k in candidates}),'maximumCombinations':maxcomb,'rejections':dict(counter)}
 print(name,'complete independent generation/provenance verified',len(candidates),flush=True)
# Every full corpus was regenerated and verified before comparison-only access.
ref=set()
for line in Path(prereg['comparisonPlan']['referencePath']).read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
four=set(json.loads((OUT/'production-four-characters.json').read_text()));oldexact={tuple(x) for x in json.loads((OUT/'final-actual-exact-pairs.json').read_text())}
assert sets['joint-original']&ref==oldexact
for name,pairs in sets.items():
 exact=pairs&ref;chars={c for c,k in exact};r=results[name];r.update({'exactPairs':len(exact),'exactCharacters':len(chars),'fourAndExactCharacters':len(four|chars)})
 for k in ['exactPairs','exactCharacters','fourAndExactCharacters']:assert r[k]==claim['policies'][name][k]
final=sets['joint-transferred']&ref
(OUT/'equivalent-transfer-actual-exact-pairs.json').write_text(json.dumps(sorted(final),ensure_ascii=False)+'\n')
(OUT/'equivalent-transfer-actual-candidate-characters.json').write_text(json.dumps(sorted({c for c,k in sets['joint-transferred']},key=ord),ensure_ascii=False)+'\n')
(OUT/'equivalent-transfer-independent-audit.json').write_text(json.dumps({'status':'passed','mappings':len(mapping),'newReadableParts':len(newparts),'addedComponentCodeChoices':added,'policies':results},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False))
