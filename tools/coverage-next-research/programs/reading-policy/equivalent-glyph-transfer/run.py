#!/usr/bin/env python3
"""MIT wrapper; data retain Unicode/GPL/CC BY/MIT upstream terms.
A single preregistered shape-mnemonic candidate transfer. No glyph normalization.
"""
from pathlib import Path
from collections import Counter
from itertools import product
import json,hashlib,re,sys,math
HERE=Path('/root/.cache/babble-coverage-next/reading-policy/equivalent-glyph-transfer')
READ=HERE.parent;ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');DECOMP=Path('/root/.cache/babble-coverage-next/decomposition')
SOURCE=ROOT/'tools/shape-expansion/inputs/EquivalentUnifiedIdeograph.txt'
CHOICES=READ/'union-all-component-choices.json'
RAW=ROOT/'tools/component-spelling/inputs/radical.yaml'
STRUCTURES=[DECOMP/'interaction/structural-rows.jsonl',DECOMP/'tagged-cjkvi/structural-rows.jsonl']
REF=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml')
EXACT=DECOMP/'tagged-cjkvi/final-exact-pairset.json'
def digest(path):
 h=hashlib.sha256();size=0
 with Path(path).open('rb')as f:
  while b:=f.read(1024*1024):h.update(b);size+=len(b)
 return {'path':str(path),'bytes':size,'sha256':h.hexdigest()}
def readjson(p):return json.loads(Path(p).read_text())
def writejson(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def check(pin):assert digest(pin['path'])==pin,pin['path']
def scalar(c):return len(c)==1 and not 0xd800<=ord(c)<=0xdfff
def own():return digest(Path(__file__))
def collect_inputs():
 old=readjson(ROOT/'data/shape-expansion-inputs.lock.json');item=next(x for x in old['sources']if x['id']=='unicode-equivalent-ideograph-17.0.0');pin=item['files'][0]
 assert digest(SOURCE)['sha256']==pin['sha256'];assert digest(SOURCE)['bytes']==pin['bytes']
 assert digest(CHOICES)['sha256']=='58ec05711e509c2f1146a42ac2fd6589503ec82f67aae4e6cddb8e966b09592a'
 assert digest(RAW)['sha256']=='c648dfd43a90f6ba60c123a7d57977cf8fc02dd470f2bee4e8fb2ef9343582b5'
 full=readjson(DECOMP/'interaction/generation-summary.json');tag=readjson(DECOMP/'tagged-cjkvi/generation-summary.json')
 assert digest(STRUCTURES[0])['sha256']==full['structuralDiagnostic']['sha256'];assert digest(STRUCTURES[1])['sha256']==tag['structural']['sha256']
 return [digest(p)for p in [SOURCE,ROOT/'data/shape-expansion-inputs.lock.json',CHOICES,RAW,*STRUCTURES,DECOMP/'interaction/generation-summary.json',DECOMP/'tagged-cjkvi/generation-summary.json',READ/'union-all.candidates.json']]
mode=sys.argv[1]
if mode=='--preregister':
 assert not(HERE/'preregistration.json').exists(),'Create a separate experiment rather than rewriting preregistration'
 report={'schemaVersion':1,'policyId':'unicode17-equivalent-glyph-mnemonic-transfer-v1','preregisteredBeforeGeneration':True,'generator':own(),'sourceProperty':'Equivalent_Unified_Ideograph','claim':'equivalent-glyph mnemonic transfer; shape similarity is not Unicode pronunciation equivalence','policy':'For EVERY explicitly mapped radical/stroke source glyph, union its existing broad union-all component-code choices with the mapped unified ideograph\'s existing broad choices. One forward mapping step only. Keep original source glyph/parts; preserve raw evidence; append mapping path, source line, target glyph and target evidence. No per-character/reference-driven selection. No inferred reverse mapping. Original four global rules are untouched because mapped source keys are distinct glyphs.','limits':{'sourceComponentCounts':[2,3],'maxCombinationsPerSourceRow':256},'inputs':collect_inputs(),'plannedCorpora':['raw-original','raw-transferred','joint-original','joint-transferred'],'structurePolicy':'Use all pre-existing reading-unrestricted source rows from both pinned structure corpora; deduplicate character/code with deterministic first source witness; raw radical rows included in joint. No structure, component-label or cut-policy changes.','comparisonPlan':{'referencePath':str(REF),'referenceSha256':'510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a','latestJointExactPairsetPath':str(EXACT),'latestJointExactPairsetSha256':'40f45347521cf144afcf032f4a9051070d295935e98b5e642806769f7eda0e1f','baselineJointFourUnion':64059,'note':'Comparison inputs are opened only after all four complete candidate corpora are generated and pinned.'},'comparisonOpened':False}
 writejson(HERE/'preregistration.json',report);print(json.dumps({'preregistered':True,'program':report['generator'],'inputCount':len(report['inputs'])}));sys.exit()
prereg=readjson(HERE/'preregistration.json');assert own()==prereg['generator'];assert prereg['comparisonOpened']is False
for pin in prereg['inputs']:check(pin)
if mode=='--generate':
 base=readjson(CHOICES);expanded=json.loads(json.dumps(base));mappings=[];target_unavailable=[];added_choices=0;new_readable=[]
 for line_num,line in enumerate(SOURCE.read_text().splitlines(),1):
  raw=line.split('#',1)[0].strip()
  if not raw:continue
  m=re.fullmatch(r'([0-9A-F]{4,6})(?:\.\.([0-9A-F]{4,6}))?\s*;\s*([0-9A-F]{4,6})',raw);assert m,(line_num,line)
  first,last,target=int(m[1],16),int(m[2]or m[1],16),chr(int(m[3],16))
  for point in range(first,last+1):
   part=chr(point);mapping={'originalPart':part,'mappedUnifiedChar':target,'sourcePath':str(SOURCE),'sourceSha256':prereg['inputs'][0]['sha256'],'sourceLine':line_num,'rawLine':line}
   assert part!=target;assert not any(x['originalPart']==part for x in mappings);mappings.append(mapping)
   if not base.get(target):target_unavailable.append(part);continue
   had=bool(base.get(part));bycode={x['code']:x for x in expanded.get(part,[])}
   for option in base[target]:
    evidence={'pinyin':option['pinyin'],'source':'equivalent-glyph mnemonic transfer','mapping':mapping,'targetCode':option['code'],'targetEvidence':option['evidence']}
    if option['code']not in bycode:bycode[option['code']]={'part':part,'pinyin':option['pinyin'],'code':option['code'],'sourceId':'equivalent-glyph mnemonic transfer','evidence':[]};added_choices+=1
    bycode[option['code']]['evidence'].append(evidence)
   expanded[part]=list(bycode.values())
   if not had:new_readable.append(part)
 writejson(HERE/'mapping-witnesses.json',{'mappings':mappings,'targetsWithoutBroadChoices':target_unavailable,'newReadableParts':new_readable,'addedComponentCodeChoices':added_choices})
 # Flatten one catalog so every candidate retains complete original/mapping provenance.
 catalog=[];indices={}
 for policy,choices in [('original',base),('transferred',expanded)]:
  indices[policy]={}
  for part,options in choices.items():
   ids=[]
   for option in options:ids.append(len(catalog));catalog.append(option)
   indices[policy][part]=ids
 writejson(HERE/'component-catalog.json',catalog)
 (HERE/'transferred-component-choices.json').write_text(json.dumps(expanded,ensure_ascii=False,separators=(',',':'))+'\n')
 def rawrows():
  for lineno,line in enumerate(RAW.read_text().splitlines(),1):
   if not line or line.startswith('#'):continue
   fields=line.split('\t');assert len(fields)==2 and scalar(fields[0]);parts=fields[1].strip().split();yield {'char':fields[0],'parts':parts},str(RAW),lineno
 def structrows():
  yield from rawrows()
  for path in STRUCTURES:
   for lineno,line in enumerate(path.open(),1):yield json.loads(line),str(path),lineno
 stats={};artifacts=[]
 for name,iterrows,policy in [('raw-original',rawrows,'original'),('raw-transferred',rawrows,'transferred'),('joint-original',structrows,'original'),('joint-transferred',structrows,'transferred')]:
  seen=set();chars=set();counts=Counter();maximum=0;missing=Counter();rows_with_transfer=0
  path=HERE/(name+'.candidates.jsonl')
  with path.open('w')as out:
   for row,source_path,source_line in iterrows():
    counts['sourceRows']+=1;parts=row['parts'];char=row['char'];assert scalar(char)
    if len(parts)not in [2,3]or not all(scalar(p)for p in parts):counts['rejectedPartCountOrScalar']+=1;continue
    options=[indices[policy].get(p,[])for p in parts]
    if not all(options):
     counts['rejectedMissingChoices']+=1
     for p,o in zip(parts,options):
      if not o:missing[p]+=1
     continue
    combos=math.prod(map(len,options));maximum=max(maximum,combos)
    if combos>256:counts['rejectedCombinationBound']+=1;continue
    counts['eligibleSourceRows']+=1
    for ids in product(*options):
     code='OK'+''.join(catalog[i]['code']for i in ids);key=(char,code)
     if key in seen:continue
     seen.add(key);chars.add(char)
     used_transfer=any(not any(baseopt['code']==catalog[i]['code']for baseopt in base.get(part,[]))for part,i in zip(parts,ids))
     rows_with_transfer+=used_transfer
     # Parts remain original. Immutable source-file/line is the full structure witness.
     out.write(json.dumps([char,code,parts,list(ids),{'path':source_path,'line':source_line},used_transfer],ensure_ascii=False,separators=(',',':'))+'\n')
  stats[name]={**counts,'candidateCharacters':len(chars),'candidatePairs':len(seen),'maximumCombinations':maximum,'pairsRequiringTransferredCodeAtFirstWitness':rows_with_transfer,'missingPartCounts':missing.most_common()};artifacts.append(digest(path));print(json.dumps({'policy':name,**{k:v for k,v in stats[name].items()if k!='missingPartCounts'}}),flush=True)
  if name=='raw-original':
   old=readjson(READ/'union-all.candidates.json');assert seen=={(r[0],r[1])for r in old['rows']},'Raw original must reproduce frozen full reading policy'
  if name=='joint-original':assert len(seen)==308673,'Structural baseline must reproduce final joined independent candidates'
 for p in [HERE/'mapping-witnesses.json',HERE/'component-catalog.json',HERE/'transferred-component-choices.json']:artifacts.append(digest(p))
 report={'schemaVersion':1,'generatedWithoutComparator':True,'preregistration':digest(HERE/'preregistration.json'),'generator':own(),'mappingCount':len(mappings),'newReadableParts':len(new_readable),'mappedTargetsWithoutChoices':len(target_unavailable),'addedComponentCodeChoices':added_choices,'statistics':stats,'generated':artifacts,'comparisonOpened':False}
 writejson(HERE/'generation-manifest.json',report);sys.exit()
if mode!='--compare':raise ValueError('Use --preregister, --generate or --compare')
gen=readjson(HERE/'generation-manifest.json');assert gen['generatedWithoutComparator'];assert own()==gen['generator'];check(gen['preregistration'])
# Every full corpus and all component/mapping evidence validated before comparator access.
for pin in gen['generated']:check(pin)
assert digest(REF)['sha256']==prereg['comparisonPlan']['referenceSha256']
reference=set()
for line in REF.read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and scalar(f[0])and re.fullmatch(r'ok[a-z]{4}(?:[a-z]{2})?',f[1]):reference.add((f[0],f[1].upper()))
assert digest(EXACT)['sha256']==prereg['comparisonPlan']['latestJointExactPairsetSha256'];latest=readjson(EXACT);latestpairs={tuple(r)for r in latest['pairs']};four=set(latest['fourCharacters']);assert len(four)==8302;assert len(four|{c for c,k in latestpairs})==64059
catalog=readjson(HERE/'component-catalog.json');pairs={};exact={};sets={};results={}
for name in ['raw-original','raw-transferred','joint-original','joint-transferred']:
 pset=set();eset=set();witnesses=[]
 for line in (HERE/(name+'.candidates.jsonl')).open():
  row=json.loads(line);pair=tuple(row[:2]);pset.add(pair)
  if pair in reference:eset.add(pair)
  baseline=exact.get(name.replace('transferred','original'),set())
  if name.endswith('transferred')and pair in reference and pair not in baseline:witnesses.append({'candidate':row,'components':[catalog[i]for i in row[3]]})
 pairs[name]=pset;exact[name]=eset;sets[name]={c for c,k in eset}
 results[name]={'candidateCharacters':len({c for c,k in pset}),'candidatePairs':len(pset),'exactCharacters':len(sets[name]),'exactPairs':len(eset),'fourAndExactCharacters':len(four|sets[name]),'newExactPairsVsOriginal':len(eset-exact.get(name.replace('transferred','original'),eset)),'newExactCharactersVsOriginal':len(sets[name]-sets.get(name.replace('transferred','original'),sets[name])),'newFourUnionCharactersVsOriginal':len((four|sets[name])-(four|sets.get(name.replace('transferred','original'),sets[name]))),'newExactPairsVsLatestJoint':len(eset-latestpairs),'newExactCharactersVsLatestJoint':len(sets[name]-{c for c,k in latestpairs}),'newFourUnionCharactersVsLatestJoint':len((four|sets[name])-(four|{c for c,k in latestpairs}))}
 if name.endswith('transferred'):writejson(HERE/(name+'.new-exact-witnesses.json'),witnesses)
assert exact['joint-original']==latestpairs,'Regenerated structural baseline must match prior exact pairset'
for kind in ['raw','joint']:assert pairs[kind+'-original']<=pairs[kind+'-transferred'];assert exact[kind+'-original']<=exact[kind+'-transferred']
basecovered=four|sets['joint-original'];newcovered=four|sets['joint-transferred']
coverage=readjson(READ/'coverage-effects.json');bench=readjson('/root/.cache/babble-coverage-research/benchmarks/repertoires.json');tgh={r['char']for r in bench['properties']['kTGH']};hy=Array=None
# Existing pinned HY contains only the tested Han range in its non-ASCII letters.
text=(ROOT/'the_Tower_of_Babel.txt').read_text();knownHan=set()
for c in set(text):
 cp=ord(c)
 if (0x3400<=cp<=0x4dbf or 0x4e00<=cp<=0x9fff or 0xf900<=cp<=0xfaff or 0x20000<=cp<=0x33479):knownHan.add(c)
assert sum(c in knownHan for c in text)==coverage['baseline']['text']['hanOccurrences']
targets={'TGH-2013-all':tgh,'kGB0':{r['char']for r in bench['properties']['kGB0']},'kBigFive':{r['char']for r in bench['properties']['kBigFive']}}
for version in readjson(ROOT/'data/unicode-targets.json')['versions']:targets['Unicode-'+version['version']]=set(chr(cp)for a,b in version['ranges']for cp in range(int(a,16),int(b,16)+1))
effects={'sets':{name:{'target':len(target),'original':len(basecovered&target),'transferred':len(newcovered&target),'added':len((newcovered-basecovered)&target)}for name,target in targets.items()},'text':{'hanOccurrences':sum(c in knownHan for c in text),'originalCovered':sum(c in knownHan and c in basecovered for c in text),'transferredCovered':sum(c in knownHan and c in newcovered for c in text),'newCharacters':sorted(knownHan&(newcovered-basecovered),key=ord)}}
report={'schemaVersion':1,'purpose':'Comparison evidence only; equivalent-glyph mnemonic transfer is not a Unicode pronunciation-equivalence claim; no product mutation','preregistration':digest(HERE/'preregistration.json'),'generationManifest':digest(HERE/'generation-manifest.json'),'verifiedCandidateArtifactsBeforeComparator':gen['generated'],'comparators':[digest(REF),digest(EXACT)],'policies':results,'coverageEffectsAfterLatestJoint':effects}
writejson(HERE/'comparison-summary.json',report);print(json.dumps({'policies':results,'coverageEffectsAfterLatestJoint':effects},ensure_ascii=False,indent=2))
