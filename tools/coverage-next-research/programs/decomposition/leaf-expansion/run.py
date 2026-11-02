#!/usr/bin/env python3
"""Uniform single named-leaf expansion, independently generated before comparison.
Generation never reads references, comparison flags or missing-target lists.
Source catalog stores the exact original topology/region/equivalence witnesses.
"""
from pathlib import Path
from collections import defaultdict,Counter
import json,hashlib,itertools,sys,time,resource,unicodedata
B=Path('/root/.cache/babble-coverage-next/decomposition');O=B/'leaf-expansion'
EXCLUDE_CJKVI='--no-cjkvi' in sys.argv
if EXCLUDE_CJKVI:O=O/'no-cjkvi'
O.mkdir(exist_ok=True)
P=Path('/root/.cache/babble-coverage-next/reading-policy/equivalent-glyph-transfer/transferred-component-choices.json')
SOURCE_PINS=[(B/'interaction/structural-rows.jsonl','3ec645f7a1e0d401055d004f3b9fbb840ac598513e33ceee15e9f01915661a4c'),(B/'tagged-cjkvi/structural-rows.jsonl','d13bcdc949bb62a73400ade354ff54f4f25c7b22876e3d2ffc7a8e44c22220c3')]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
write=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
if sys.argv[1]=='--generate':
 start=time.monotonic();assert sha(P)=='6a39246750903171dc88ab58333c893d7a58e6ea8796568d9457e94f80d747b5'
 prop=Path('/root/.cache/babble-coverage-research/benchmarks/PropList-18.0.0.txt');assert sha(prop)=='f438f532e8737bb8a2702126cdf9c4af5e357c58c7acf9d9eb2fc7c1a1d955d6'
 stable=set()
 for line in prop.read_text().splitlines():
  raw=line.split('#')[0].strip()
  if not raw:continue
  rr,name=map(str.strip,raw.split(';'))
  if name not in {'Ideographic','Unified_Ideograph','Radical'}:continue
  bounds=rr.split('..');stable.update(chr(n) for n in range(int(bounds[0],16),int(bounds[-1],16)+1))
 # Stable CJK stroke names, not appearance-based inferred radical aliases.
 stable.update(chr(n) for n in range(0x31c0,0x3200) if unicodedata.name(chr(n),'').startswith('CJK STROKE '))
 pins=[{'path':str(prop),'sha256':sha(prop),'identityProperties':['Ideographic','Unified_Ideograph','Radical'],'strokeNameDatabaseVersion':unicodedata.unidata_version}]
 for i,(p,manifestsha) in enumerate(SOURCE_PINS):
  mp=p.parent/'generation-summary.json';assert sha(mp)==manifestsha;m=json.loads(mp.read_text());expected=m['structuralDiagnostic']['sha256'] if i==0 else m['structural']['sha256'];assert sha(p)==expected;pins.append({'path':str(p),'sha256':expected,'manifestSha256':manifestsha})
 prereg={'policy':'one-source-backed-named-leaf-expansion-v3','scope':'External research only; no production adoption','excludeDirectCJKVIParentAndChild':EXCLUDE_CJKVI,'identity':'Admit source-cut target and every component only if present in fixed Unicode18 Ideographic/Unified_Ideograph/Radical properties or an explicitly named CJK STROKE in the recorded Unicode name database. This includes documented compatibility Han and〇/〢/〣, excludes placeholders/entities/PUA/Katakana. Never identify unrelated unknown shapes.','rule':'For every independently sourced 2-component structural cut, substitute exactly ONE component by EACH independently sourced 2-component cut defining that scalar character, producing exactly 3 ordered components. Apply uniformly to all source characters, no target-list filter. No further leaf expansion.','topology':'Outer source topology remains, inner character definition supplies replacement subtree; both full original witnesses/equivalences/region tags stay in source-cut catalog. Flat source cuts retain their ordered-source scope. All source variants are considered; no inferred regional preference or pronunciation equivalence.','cycles':'Reject outer target self component, inner self component, or reintroduction of outer target by inner components. Repeated sibling leaves alone are permitted.','dedup':'Keep first complete witness for each distinct (source-character,ordered component sequence); then first complete two-source witness per (target-character,code). All original source artifacts stay pinned.','bounds':{'maxNewStructuralSequencesPerOuterCut':4096,'maximumSoundCombinationsPerNewSequence':256,'maximumExpansionDepth':1,'outputComponentCount':3},'choices':{'path':str(P),'sha256':sha(P)},'sources':pins,'generatorSha256':sha(Path(__file__)),'comparisonOpened':False,'comparisonOnly':'Fixed official/OK references and previous exact pairsets are opened only by --compare, never generation.'}
 write(O/'preregistration.json',prereg)
 choices=json.loads(P.read_text());assert isinstance(choices,dict)
 print('choices',len(choices),flush=True)
 # Collapse duplicate equivalent cuts, retaining their first full source witness.
 catalog=[];cutids={};index=defaultdict(list);counts=Counter()
 for pin in pins:
  if 'identityProperties' in pin:continue
  with Path(pin['path']).open() as stream:
   for line,l in enumerate(stream,1):
    r=json.loads(l);counts['sourceRows']+=1
    if EXCLUDE_CJKVI and any('cjkvi--cjkvi-ids' in x.get('file','') for x in [r['witness'],*r['equivalences']]):counts['sourceRowsExcludedDirectCjkvi']+=1;continue
    if r['char'] not in stable or any(x not in stable for x in r['parts']):counts['sourceRowsUnstableIdentityRejected']+=1;continue
    if len(r['parts'])!=2:counts['sourceRowsNotTwoParts']+=1;continue
    counts['sourceRowsTwoParts']+=1;key=(r['char'],tuple(r['parts']))
    if key in cutids:counts['duplicateTwoPartCuts']+=1;continue
    cid=len(catalog);cutids[key]=cid;catalog.append({'id':cid,'sourceArtifact':pin['path'],'sourceArtifactLine':line,'sourceRecord':r});index[r['char']].append(cid)
 catalog_path=O/'source-cut-catalog.json';write(catalog_path,catalog)
 print('distinct two part cuts',len(catalog),flush=True)
 # Components point to full provenance from the already independently generated EUI policy.
 codechoices={part:list({x['code']:x for x in xs}.values()) for part,xs in choices.items()}
 records={};newstruct={};maxstruct=0;maxcombos=0;rejectedparts=Counter();rejectchars=defaultdict(set);distribution=Counter();decompcounts=Counter()
 for outerid,outer in enumerate(catalog):
  row=outer['sourceRecord'];target=row['char'];parent=tuple(row['parts']);counts['outerCuts']+=1
  if target in parent:counts['outerSelfCycleRejected']+=1;continue
  found={};hadchild=False;overflow=False
  for pos,part in enumerate(parent):
   if part not in index:counts['leafWithoutTwoPartDefinition']+=1;continue
   hadchild=True
   for innerid in index[part]:
    inner=catalog[innerid]['sourceRecord'];children=tuple(inner['parts']);counts['substitutionAttempts']+=1
    if part in children:counts['innerSelfCycleRejected']+=1;continue
    if target in children:counts['outerReintroducedCycleRejected']+=1;continue
    parts=parent[:pos]+children+parent[pos+1:];assert len(parts)==3
    found.setdefault(parts,(outerid,pos,innerid))
    if len(found)>4096:overflow=True;break
   if overflow:break
  maxstruct=max(maxstruct,len(found))
  if overflow:counts['outerExpansionLimitRejected']+=1;continue
  if not hadchild:counts['outerCutsNoExpandableLeaf']+=1
  for parts,proof in found.items():
   sk=(target,parts)
   if sk in newstruct:counts['duplicateExpandedSequences']+=1;continue
   newstruct[sk]=proof;counts['distinctExpandedSequences']+=1;decompcounts[target]+=1
   absent=[p for p in parts if p not in codechoices]
   if absent:
    counts['expandedSequencesMissingChoices']+=1
    for p in set(absent):rejectedparts[p]+=1;rejectchars[p].add(target)
    continue
   combos=1
   for p in parts:combos*=len(codechoices[p])
   maxcombos=max(maxcombos,combos);distribution[combos]+=1
   if combos>256:counts['soundCombinationLimitRejected']+=1;continue
   counts['encodableExpandedSequences']+=1
   for cs in itertools.product(*(codechoices[p] for p in parts)):
    code='OK'+''.join(c['code'] for c in cs);key=(target,code)
    records.setdefault(key,{'char':target,'code':code,'parts':parts,'sourceCutIds':{'outer':proof[0],'expandedIndex':proof[1],'inner':proof[2]},'componentCodeWitnesses':[{'part':c['part'],'code':c['code']} for c in cs]})
 payload=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for k,r in sorted(records.items(),key=lambda kv:(ord(kv[0][0]),kv[0][1])))
 candidate_path=O/'candidates.jsonl';candidate_path.write_text(payload)
 # Include all expanded structural rows, even where readings are missing.
 structural_path=O/'expanded-structural-rows.jsonl';structural_path.write_text(''.join(json.dumps({'char':c,'parts':parts,'sourceCutIds':{'outer':p[0],'expandedIndex':p[1],'inner':p[2]}},ensure_ascii=False,separators=(',',':'))+'\n' for (c,parts),p in newstruct.items()))
 stats={'generatedWithoutComparator':True,'excludeDirectCJKVIParentAndChild':EXCLUDE_CJKVI,'preregistrationSha256':sha(O/'preregistration.json'),'generatorSha256':sha(Path(__file__)),'choicesSha256':sha(P),'sourcePins':pins,'counts':dict(counts),'candidateCharacters':len({c for c,k in records}),'candidatePairs':len(records),'maxNewStructuralSequencesPerOuterCutObserved':maxstruct,'maximumSoundCombinations':maxcombos,'combinationDistribution':dict(distribution),'maxExpandedSequencesPerCharacter':max(decompcounts.values(),default=0),'missingChoiceParts':[{'part':p,'expandedSequences':n,'chars':len(rejectchars[p])} for p,n in rejectedparts.most_common()],'artifacts':[{'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p)} for p in [catalog_path,candidate_path,structural_path]],'wallSeconds':time.monotonic()-start,'maxResidentMemoryKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
 write(O/'generation-summary.json',stats);print(json.dumps({k:v for k,v in stats.items() if k not in ['missingChoiceParts']},ensure_ascii=False,indent=2),flush=True)
else:raise SystemExit('Use --generate; comparison is a separate program')
