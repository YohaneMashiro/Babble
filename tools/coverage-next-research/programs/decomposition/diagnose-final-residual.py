#!/usr/bin/env python3
"""POST-GENERATION diagnosis only; may read fixed reference expected chunks.
No new candidates, substitutions, aliases, or product rules are produced.
Expected chunks are diagnostic clues and must acquire independent source evidence.
"""
from pathlib import Path
from collections import Counter,defaultdict
import json,re,hashlib
B=Path('/root/.cache/babble-coverage-next/decomposition');T=B/'tagged-cjkvi';I=B/'interaction'
remaining=json.loads((T/'remaining-targets.json').read_text());target=set(remaining['hasCandidatesNoExactMirrorPair'])
choices=json.loads(Path('/root/.cache/babble-coverage-next/reading-policy/union-all-component-choices.json').read_text());codes={p:{x['code'] for x in xs} for p,xs in choices.items()};readable=set(codes)
parts=defaultdict(dict);unrestrictedCounts=defaultdict(set);rawrows=0;complete=0
for path in [I/'structural-rows.jsonl',T/'structural-rows.jsonl']:
 for l in path.open():
  r=json.loads(l)
  if r['char'] not in target:continue
  rawrows+=1;p=tuple(r['parts']);unrestrictedCounts[r['char']].add(len(p))
  if not all(x in readable for x in p):continue
  combinations=1
  for x in p:combinations*=len(codes[x])
  if combinations>256:continue
  complete+=1;parts[r['char']].setdefault(p,r)
assert set(parts)==target,('missing structural complete witnesses',target-set(parts))
refp=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml');assert hashlib.sha256(refp.read_bytes()).hexdigest()=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
refs=defaultdict(set)
for l in refp.read_text().splitlines():
 f=l.split('\t')
 if len(f)>1 and f[0] in target and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):refs[f[0]].add(f[1].upper())
assert set(refs)==target
counts=Counter();hist=Counter();lengths=Counter();charbest={};charstats={};all_def=Counter();near_def=Counter();one_def=Counter();defchars=defaultdict(set);nearchars=defaultdict(set);onechars=defaultdict(set);onewitness={};otherwitness={}
for c,refcodes in refs.items():
 best_for_char=9;stats=[];char_no_length=True
 for code in refcodes:
  expected=tuple(code[n:n+2] for n in range(2,len(code),2));lengths[str(len(code))]+=1
  options=[(p,r) for p,r in parts[c].items() if len(p)==len(expected)]
  if not options:
   counts['referencePairsNoSamePartCountWitness']+=1
   counts['noCompleteSameCountButUnrestrictedStructureExists' if len(expected) in unrestrictedCounts[c] else 'noSameCountEvenInUnrestrictedStructure']+=1
   stats.append({'code':code,'samePartCount':False,'unrestrictedSamePartCount':len(expected) in unrestrictedCounts[c],'availablePartCounts':sorted({len(p) for p in parts[c]})});continue
  char_no_length=False;counts['referencePairsWithSamePartCountWitness']+=1
  ranked=[];allkeys=set()
  for p,row in options:
   deficits=tuple((part,want) for part,want in zip(p,expected) if want not in codes[part]);assert deficits,(c,code,p)
   ranked.append((len(deficits),p,row,deficits));allkeys.update(deficits)
  best=min(n for n,p,r,ds in ranked);hist[str(best)]+=1;best_for_char=min(best_for_char,best)
  near=[(p,row,ds) for n,p,row,ds in ranked if n==best];nearkeys={d for p,row,ds in near for d in ds}
  for k in allkeys:all_def[k]+=1;defchars[k].add(c)
  for k in nearkeys:near_def[k]+=1;nearchars[k].add(c)
  for p,row,ds in near:
   witness={'char':c,'referenceCode':code,'expectedChunks':expected,'parts':p,'missingComponentCodes':[{'part':part,'expectedCode':want,'availableCodes':sorted(codes[part])} for part,want in ds],'sourceWitness':row}
   if best==1:onewitness.setdefault((c,code,p),witness)
   else:otherwitness.setdefault((c,code),witness)
  if best==1:
   for k in nearkeys:one_def[k]+=1;onechars[k].add(c)
  stats.append({'code':code,'samePartCount':True,'minimumMissingComponentCodes':best,'sameCountSourceSequences':len(options),'nearestSourceSequences':len(near)})
 counts['charsNoSamePartCountForAnyReference' if char_no_length else 'charsWithSamePartCountForSomeReference']+=1
 if best_for_char<9:charbest[c]=best_for_char
 charstats[c]=stats

no_complete={c:rs for c,rs in charstats.items() if not any(r['samePartCount'] for r in rs)}
counts['charsNoCompleteSameCountButUnrestrictedStructureExists']=sum(any(r.get('unrestrictedSamePartCount') for r in rs) for rs in no_complete.values())
counts['charsNoSameCountEvenInUnrestrictedStructure']=sum(not any(r.get('unrestrictedSamePartCount') for r in rs) for rs in no_complete.values())

def ranking(counter,charset):return [{'part':p,'expectedCode':code,'referencePairs':n,'chars':len(charset[(p,code)])} for (p,code),n in counter.most_common()]
summary={'scope':'Post-generation diagnostics only; reference expected chunks are not new phonetic facts or candidate rules. Ranked deficits require independent public component mnemonic/shape evidence before generation policy changes. No comparator answers redistributed in repo.','candidatePolicyFrozen':True,'remainingCandidateNoExactChars':len(target),'sourceSequences':sum(map(len,parts.values())),'sourceRowsVisited':rawrows,'completeSourceRows':complete,'referencePairs':sum(lengths.values()),'referenceLengthCounts':dict(lengths),'lengthAvailability':dict(counts),'referencePairNearestMissingComponentHistogram':dict(hist),'charNearestMissingComponentHistogram':dict(Counter(map(str,charbest.values()))),'allSameCountDeficits':ranking(all_def,defchars)[:50],'nearestDeficits':ranking(near_def,nearchars)[:50],'exactlyOneMissingComponentDeficits':ranking(one_def,onechars)[:50],'oneComponentDifferenceWitnessRows':len(onewitness),'oneComponentDifferenceChars':len({k[0] for k in onewitness}),'pins':{'finalComparisonSha256':hashlib.sha256((T/'final-comparison-summary.json').read_bytes()).hexdigest(),'readingChoicesSha256':hashlib.sha256(Path('/root/.cache/babble-coverage-next/reading-policy/union-all-component-choices.json').read_bytes()).hexdigest()}}
(T/'residual-diagnostic-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(T/'one-component-difference-witnesses.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in onewitness.values()))
(T/'residual-per-character-diagnostic.json').write_text(json.dumps(charstats,ensure_ascii=False,separators=(',',':'))+'\n')
(T/'residual-full-ranked-deficits.json').write_text(json.dumps({'allSameCount':ranking(all_def,defchars),'nearest':ranking(near_def,nearchars),'oneComponent':ranking(one_def,onechars)},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
