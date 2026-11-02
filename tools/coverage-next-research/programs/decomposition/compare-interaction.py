#!/usr/bin/env python3
"""Read complete hash-pinned candidate corpora, then fixed comparators.
All candidate membership and source traces were generated independently.
"""
from pathlib import Path
from collections import Counter,defaultdict
import json,hashlib,re
BASE=Path('/root/.cache/babble-coverage-next/decomposition');OUT=BASE/'interaction'
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
gen=json.loads((OUT/'generation-summary.json').read_text());fixed=json.loads((BASE/'generation-summary.json').read_text())
assert gen['generatedWithoutComparator'] and fixed['generatedWithoutComparator']
for parent,g in [(BASE,fixed),(OUT,gen)]:
 for row in g['policies']:assert sha(parent/(row['policy']+'-candidates.jsonl'))==row['sha256']
assert sha(OUT/'structural-rows.jsonl')==gen['structuralDiagnostic']['sha256']
rp=Path('/root/.cache/babble-coverage-next/reading-policy/union-all.candidates.json')
assert sha(rp)=='aaed131653f4b9dfa326e23db21451f24e9cda7d8005c8edb29728b44deb3a39'
# End of independent-corpus verification. Comparators opened only below.
REF=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml')
assert sha(REF)=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
ref=set()
for line in REF.read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
refchars={c for c,k in ref}
ixp=Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json')
assert sha(ixp)==ixp.stem
ix=json.loads(ixp.read_text());ref4={(c,token.rstrip('-+*').upper()) for c,v in ix.items() for token in v['1'].split() if re.fullmatch('[a-zA-Z]{4}[-+*]*',token)};ref4chars={c for c,k in ref4};officialtarget=refchars|ref4chars
basepairs={(r['char'],r['code']) for r in json.loads((BASE/'baseline-candidates.json').read_text())['records']};basematch=basepairs&ref;basechars={c for c,k in basepairs};basemchars={c for c,k in basematch}
four=set(json.loads(Path('/root/.cache/babble-coverage-research/local/current-target-inventory.json').read_text())['trainingCharacters'])|{r['char'] for r in json.loads((ROOT/'src/data/generated/four-code-coverage.json').read_text())['records']};baseunion=four|basemchars
reading=json.loads(rp.read_text());readingpairs={(r[0],r[1]) for r in reading['rows']};readingmatch=readingpairs&ref;readingmchars={c for c,k in readingmatch}
fixedpairs=basepairs.copy();fixedmatches=basematch.copy()
for row in fixed['policies']:
 with (BASE/(row['policy']+'-candidates.jsonl')).open() as stream:
  for l in stream:
   r=json.loads(l);p=(r['char'],r['code']);fixedpairs.add(p)
   if p in ref:fixedmatches.add(p)
fixedmchars={c for c,k in fixedmatches};fixedchars={c for c,k in fixedpairs}
allpairs=readingpairs|basepairs;allmatches=readingmatch|basematch;policies=[];witness={};ambiguity={};combo_total=Counter()
for row in gen['policies']:
 name=row['policy'];pairs=set();chars=set();matches=set();compounds=0;parts_per_char=defaultdict(set);pair_per_char=Counter();multi_reading_rows=set()
 with (OUT/(name+'-candidates.jsonl')).open() as stream:
  for l in stream:
   r=json.loads(l);pair=(r['char'],r['code']);pairs.add(pair);chars.add(r['char']);parts_per_char[r['char']].add(tuple(r['parts']));pair_per_char[r['char']]+=1
   if r['equivalences']:compounds+=1
   if pair in ref:
    matches.add(pair)
    if pair not in fixedmatches and pair not in readingmatch:witness.setdefault(pair,{'policy':name,**r})
 mchars={c for c,k in matches};newcum=matches-allmatches;newcumchars=mchars-{c for c,k in allmatches}
 stats={**row,'exactChars':len(mchars),'exactPairs':len(matches),'newExactCharsVsFixedBaseline':len(mchars-basemchars),'newExactPairsVsFixedBaseline':len(matches-basematch),'newExactCharsAfterReadingPolicy':len(mchars-readingmchars),'newExactPairsAfterReadingPolicy':len(matches-readingmatch),'newExactCharsAfterFixedDecompAndReadingUnion':len(mchars-(fixedmchars|readingmchars)),'newExactPairsAfterFixedDecompAndReadingUnion':len(matches-(fixedmatches|readingmatch)),'cumulativeNewCharsThisPolicy':len(newcumchars),'cumulativeNewPairsThisPolicy':len(newcum),'fourAndBaselineAndPolicyConfirmed':len(four|basemchars|mchars),'addedAfterFourBaseline':len(mchars-baseunion),'ambiguousCandidateCharacters':sum(n>1 for n in pair_per_char.values()),'maxCandidatesPerCharacter':max(pair_per_char.values(),default=0),'charactersWithMultipleDecompositions':sum(len(v)>1 for v in parts_per_char.values()),'maxDecompositionsPerCharacter':max(map(len,parts_per_char.values()),default=0),'compoundEquivalenceCandidatePairs':compounds}
 policies.append(stats);allpairs|=pairs;allmatches|=matches
 print(json.dumps({k:v for k,v in stats.items() if k not in ['sourceStats']},ensure_ascii=False),flush=True)
allchars={c for c,k in allpairs};exactchars={c for c,k in allmatches};jointunion=four|exactchars
uni=set()
for line in Path('/root/.cache/babble-coverage-research/benchmarks/PropList-18.0.0.txt').read_text().splitlines():
 raw=line.split('#')[0].strip()
 if not raw:continue
 rr,p=map(str.strip,raw.split(';'))
 if p!='Unified_Ideograph':continue
 rs=rr.split('..');uni.update(chr(n) for n in range(int(rs[0],16),int(rs[-1],16)+1))
struct=gen['structuralDiagnostic'];sourcekeys=set(struct['allSourceKeys']);structkeys=set(struct['structuralKeys']);parsedkeys=set(struct['parsedCompoundKeys']);missing=officialtarget-jointunion
classes={k:set() for k in ['noAuditedSourceKey','sourcePresentNoPermitted23Cut','structuralCutButNoCompleteReadingChoices','hasCandidatesNoExactMirrorPair']}
for c in missing:
 if c in allchars:cat='hasCandidatesNoExactMirrorPair'
 elif c not in sourcekeys:cat='noAuditedSourceKey'
 elif c not in structkeys:cat='sourcePresentNoPermitted23Cut'
 else:cat='structuralCutButNoCompleteReadingChoices'
 classes[cat].add(c)
assert sum(map(len,classes.values()))==len(missing)
# Diagnostic component blockers from source-supported, reading-independent cuts.
choices=json.loads(Path(gen['choices']['path']).read_text());readable=set(choices);blockers=Counter();blockerchars=defaultdict(set);blockedrows=0
with (OUT/'structural-rows.jsonl').open() as stream:
 for l in stream:
  r=json.loads(l)
  if r['char'] not in classes['structuralCutButNoCompleteReadingChoices']:continue
  absent=set(r['parts'])-readable
  assert absent,(r['char'],r['parts'])
  blockedrows+=1
  for p in absent:blockers[p]+=1;blockerchars[p].add(r['char'])
classrows={cat:{'characters':len(cs),'unicode18Characters':len(cs&uni),'exampleCharacters':''.join(sorted(cs,key=ord)[:30])} for cat,cs in classes.items()}
# Whole-policy order-independent effects, not an oracle-selected subset.
summary={'scope':'External research; all full reading/source policies complete before fixed comparator reads','reference':{'okChars':len(refchars),'okPairs':len(ref),'okSha256':sha(REF),'officialFourChars':len(ref4chars),'officialFourPairs':len(ref4),'officialFourSha256':sha(ixp),'officialFourAndOKUnion':len(officialtarget),'currentFourAndOKUnion':len(four|refchars)},'baseline':{'candidateChars':len(basechars),'candidatePairs':len(basepairs),'exactChars':len(basemchars),'exactPairs':len(basematch),'fourChars':len(four),'fourAndExactChars':len(baseunion)},'readingOnly':{'candidateChars':len({c for c,k in readingpairs}),'candidatePairs':len(readingpairs),'exactChars':len(readingmchars),'exactPairs':len(readingmatch),'fourAndExactChars':len(four|readingmchars)},'fixedReadingDecomposition':{'candidateChars':len(fixedchars),'candidatePairs':len(fixedpairs),'exactChars':len(fixedmchars),'exactPairs':len(fixedmatches),'fourAndExactChars':len(four|fixedmchars)},'policies':policies,'combined':{'candidateChars':len(allchars),'candidatePairs':len(allpairs),'exactChars':len(exactchars),'exactPairs':len(allmatches),'fourAndExactChars':len(jointunion),'newExactCharsVsBaseline':len(exactchars-basemchars),'newExactPairsVsBaseline':len(allmatches-basematch),'newAfterFourAndBaselineChars':len(jointunion-baseunion),'newAfterReadingOnlyChars':len(exactchars-readingmchars),'newAfterReadingOnlyPairs':len(allmatches-readingmatch),'newAfterFixedReadingDecompChars':len(exactchars-fixedmchars),'newAfterFixedReadingDecompPairs':len(allmatches-fixedmatches),'newBeyondUnionOfSeparateStudiesChars':len(exactchars-(fixedmchars|readingmchars)),'newBeyondUnionOfSeparateStudiesPairs':len(allmatches-(fixedmatches|readingmatch)),'officialTargetMissing':len(missing),'okMissing':len(refchars-exactchars),'okNoCandidates':len(refchars-allchars),'unicode18Target':len(uni),'unicode18Candidates':len(uni&allchars),'unicode18Exact':len(uni&exactchars),'unicode18FourOrExact':len(uni&jointunion),'unicode18NotOfficialTarget':len(uni-officialtarget),'unicode18NotOfficialTargetHasCandidates':len((uni-officialtarget)&allchars),'unicode18NotOfficialTargetNoCandidates':len((uni-officialtarget)-allchars)},'remainingOfficialTargetClassification':classrows,'readingBlockers':{'blockedRows':blockedrows,'distinctParts':len(blockers),'top':[{'part':p,'rows':n,'chars':len(blockerchars[p])} for p,n in blockers.most_common(35)]},'pins':{'generationSummarySha256':sha(OUT/'generation-summary.json'),'fixedGenerationSha256':sha(BASE/'generation-summary.json'),'readingPolicyCandidateSha256':sha(rp)}}
(OUT/'comparison-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(OUT/'interaction-only-match-witnesses.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for k,r in sorted(witness.items(),key=lambda kv:(ord(kv[0][0]),kv[0][1]))))
(OUT/'remaining-targets.json').write_text(json.dumps({cat:''.join(sorted(cs,key=ord)) for cat,cs in classes.items()},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['policies']},ensure_ascii=False,indent=2),flush=True)
