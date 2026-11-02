from pathlib import Path
from collections import defaultdict,Counter
import json,hashlib,itertools,math,re,sys,gc,unicodedata
B=Path('/root/.cache/babble-coverage-next/decomposition');O=Path('/root/.cache/babble-coverage-next/checker');EXCLUDE='--no-cjkvi' in sys.argv;P=B/'leaf-expansion';P=P/'no-cjkvi' if EXCLUDE else P
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
g=json.loads((P/'generation-summary.json').read_text());prereg=json.loads((P/'preregistration.json').read_text());assert g['generatedWithoutComparator'] and prereg['comparisonOpened'] is False
assert sha(B/'leaf-expansion/run.py')==g['generatorSha256']==prereg['generatorSha256'];assert sha(P/'preregistration.json')==g['preregistrationSha256']
assert g['excludeDirectCJKVIParentAndChild']==EXCLUDE
for pin in g['artifacts']:assert sha(pin['path'])==pin['sha256'] and Path(pin['path']).stat().st_size==pin['bytes']
stable=set()
for pin in g['sourcePins']:
 assert sha(pin['path'])==pin['sha256']
 if 'manifestSha256' in pin:assert sha(Path(pin['path']).parent/'generation-summary.json')==pin['manifestSha256']
 if 'identityProperties' in pin:
  assert pin['strokeNameDatabaseVersion']==unicodedata.unidata_version
  for line in Path(pin['path']).read_text().splitlines():
   body=line.split('#')[0].strip()
   if not body:continue
   rr,name=map(str.strip,body.split(';'))
   if name in {'Ideographic','Unified_Ideograph','Radical'}:
    bounds=rr.split('..');stable.update(chr(n) for n in range(int(bounds[0],16),int(bounds[-1],16)+1))
stable.update(chr(n) for n in range(0x31c0,0x3200) if unicodedata.name(chr(n),'').startswith('CJK STROKE '))
assert '□' not in stable and '�' not in stable and not any(0xe000<=ord(c)<=0xf8ff for c in stable)
choicespath=Path(prereg['choices']['path']);assert sha(choicespath)==prereg['choices']['sha256'];choices=json.loads(choicespath.read_text());codes={p:[c['code'] for c in cs] for p,cs in choices.items()}
# Independent checker source-topology validator, with documented region suffixes.
ns={};exec(compile((O/'audit-decomposition.py').read_text().split('basejson=')[0],str(O/'audit-decomposition.py'),'exec'),ns);oldtree=ns['tree'];tree=lambda e:oldtree(re.sub(r'(?:\[[A-Z]+\])+$','',e));source_expr=ns['source_expr'];cuts=ns['cuts']
def validate(r):
 c=r['char'];parts=tuple(r['parts']);w=r['witness'];eqs=r['equivalences']
 if r.get('policy','cjkvi-tagged').startswith('flat-'):
  original=tuple(source_expr(w,c,True).split());eq={}
  for e in eqs:eq.setdefault(tuple(source_expr(e,e['char'],True).split()),set()).add(e['char'])
  if r['policy']=='flat-explicit-alternatives':assert parts==original and not eqs
  else:
   valid=False
   for boundaries in itertools.combinations(range(1,len(original)),len(parts)-1):
    pts=(0,)+boundaries+(len(original),)
    if all((original[i:j]==(part,) if j-i==1 else part in eq.get(original[i:j],set())) for part,i,j in zip(parts,pts,pts[1:])):valid=True;break
   assert valid
 else:
  assert w['expression'] in source_expr(w,c).split(';');eq={}
  for e in eqs:
   assert e['expression'] in source_expr(e,e['char']).split(';');eq.setdefault(tree(e['expression']),set()).add(e['char'])
  assert parts in cuts(tree(w['expression']),eq)
actualcat=json.loads((P/'source-cut-catalog.json').read_text());catalog=[];seen=set();count=Counter();index=defaultdict(list)
for pin in g['sourcePins']:
 if 'identityProperties' in pin:continue
 for no,line in enumerate(Path(pin['path']).open(),1):
  r=json.loads(line);count['sourceRows']+=1
  if EXCLUDE and any('cjkvi--cjkvi-ids' in x.get('file','') for x in [r['witness'],*r['equivalences']]):count['sourceRowsExcludedDirectCjkvi']+=1;continue
  if r['char'] not in stable or any(p not in stable for p in r['parts']):count['sourceRowsUnstableIdentityRejected']+=1;continue
  if len(r['parts'])!=2:count['sourceRowsNotTwoParts']+=1;continue
  count['sourceRowsTwoParts']+=1;key=(r['char'],tuple(r['parts']))
  if key in seen:count['duplicateTwoPartCuts']+=1;continue
  seen.add(key);cid=len(catalog);a=actualcat[cid];assert a=={'id':cid,'sourceArtifact':pin['path'],'sourceArtifactLine':no,'sourceRecord':r}
  validate(r);catalog.append(key);index[r['char']].append(cid)
assert len(catalog)==len(actualcat);del actualcat,seen;gc.collect();print('catalog complete identity/source/topology verified',len(catalog),flush=True)
struct={};maxstruct=0
for outerid,(target,parent) in enumerate(catalog):
 count['outerCuts']+=1
 if target in parent:count['outerSelfCycleRejected']+=1;continue
 found={};had=False
 for pos,part in enumerate(parent):
  if part not in index:count['leafWithoutTwoPartDefinition']+=1;continue
  had=True
  for innerid in index[part]:
   innerchar,children=catalog[innerid];assert innerchar==part;count['substitutionAttempts']+=1
   if part in children:count['innerSelfCycleRejected']+=1;continue
   if target in children:count['outerReintroducedCycleRejected']+=1;continue
   parts=parent[:pos]+children+parent[pos+1:];found.setdefault(parts,(outerid,pos,innerid))
 maxstruct=max(maxstruct,len(found));assert len(found)<=4096
 if not had:count['outerCutsNoExpandableLeaf']+=1
 for parts,proof in found.items():
  key=(target,parts)
  if key in struct:count['duplicateExpandedSequences']+=1;continue
  struct[key]=proof;count['distinctExpandedSequences']+=1
actualstruct=set()
for line in (P/'expanded-structural-rows.jsonl').open():
 r=json.loads(line);key=(r['char'],tuple(r['parts']));assert key not in actualstruct;actualstruct.add(key);proof=r['sourceCutIds'];assert struct[key]==(proof['outer'],proof['expandedIndex'],proof['inner'])
assert actualstruct==struct.keys();del actualstruct;gc.collect();print('complete independent structural expansion verified',len(struct),flush=True)
expected={};maximum=0;dist=Counter()
for (target,parts),proof in struct.items():
 if any(p not in codes for p in parts):count['expandedSequencesMissingChoices']+=1;continue
 combos=math.prod(len(codes[p]) for p in parts);maximum=max(maximum,combos);dist[combos]+=1
 if combos>256:count['soundCombinationLimitRejected']+=1;continue
 count['encodableExpandedSequences']+=1
 for combo in itertools.product(*(codes[p] for p in parts)):expected.setdefault((target,'OK'+''.join(combo)),(parts,proof))
actual=set()
for line in (P/'candidates.jsonl').open():
 r=json.loads(line);key=(r['char'],r['code']);assert key not in actual;actual.add(key);parts,proof=expected[key]
 assert tuple(r['parts'])==parts and r['sourceCutIds']=={'outer':proof[0],'expandedIndex':proof[1],'inner':proof[2]}
 cs=r['componentCodeWitnesses'];assert [c['part'] for c in cs]==list(parts) and r['code']=='OK'+''.join(c['code'] for c in cs)
 assert all(c['code'] in codes[c['part']] for c in cs)
assert actual==expected.keys();assert len(actual)==g['candidatePairs'] and len({c for c,k in actual})==g['candidateCharacters'];assert maximum==g['maximumSoundCombinations'] and maxstruct==g['maxNewStructuralSequencesPerOuterCutObserved'];assert {str(k):v for k,v in dist.items()}==g['combinationDistribution']
assert dict(count)==g['counts'];del expected,struct;gc.collect();print('complete independent pair generation/first witnesses verified',len(actual),flush=True)
# Every complete candidate and structural witness has been checked before comparator access.
ref=set()
for line in Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml').read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
exact=actual&ref;oldname='without-cjkvi-actual-exact-pairs.json' if EXCLUDE else 'equivalent-transfer-actual-exact-pairs.json';oldexact={tuple(x) for x in json.loads((O/oldname).read_text())};combined=oldexact|exact;chars={c for c,k in combined};four=set(json.loads((O/'production-four-characters.json').read_text()));common=json.loads((O/'common-finite-independent-audit.json').read_text());finite={r['char'] for r in common['codeComparison'] if r['exact'] and not r['contextHeld']};union=four|chars;withfinite=union|finite
out={'status':'passed','excludeDirectCJKVIParentAndChild':EXCLUDE,'sourceCatalogCuts':len(catalog),'independentSourceTopologyAndCatalogEqual':True,'independentCompleteStructuralAndPairSetsEqual':True,'allFirstParentAndChildWitnessesVerified':True,'candidatePairs':len(actual),'candidateCharacters':len({c for c,k in actual}),'maximumSoundCombinations':maximum,'maxStructuralSequencesPerOuter':maxstruct,'exactExpansionPairs':len(exact),'exactExpansionCharacters':len({c for c,k in exact}),'combinedExactPairs':len(combined),'combinedExactCharacters':len(chars),'fourAndExact':len(union),'withFiniteEndpoints':len(withfinite),'newAnyMethodVsProduction':len(withfinite)-60891,'newVsPriorSourcePolicy':len(union-(four|{c for c,k in oldexact})),'counts':dict(count)}
label='leaf-no-cjkvi' if EXCLUDE else 'leaf-full'
(O/(label+'-independent-audit.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');(O/(label+'-actual-exact-pairs.json')).write_text(json.dumps(sorted(combined),ensure_ascii=False)+'\n')
print(json.dumps(out,ensure_ascii=False))
