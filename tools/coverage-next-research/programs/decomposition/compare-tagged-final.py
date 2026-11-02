#!/usr/bin/env python3
"""Final order-independent source/readings union after documented tag parsing.
Verify complete immutable corpora before comparator access. No generation here.
"""
from pathlib import Path
from collections import Counter,defaultdict
import json,hashlib,re
B=Path('/root/.cache/babble-coverage-next/decomposition');I=B/'interaction';T=B/'tagged-cjkvi'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
fixedgen=json.loads((B/'generation-summary.json').read_text());fullgen=json.loads((I/'generation-summary.json').read_text());taggen=json.loads((T/'generation-summary.json').read_text())
assert all(g['generatedWithoutComparator'] for g in [fixedgen,fullgen,taggen])
corpora=[]
for parent,g,kind in [(B,fixedgen,'fixed'),(I,fullgen,'full'),(T,taggen,'tag')]:
 for row in g['policies']:
  path=parent/(row['policy']+'-candidates.jsonl');assert sha(path)==row['sha256'];corpora.append((kind,row['policy'],path,row))
assert sha(I/'structural-rows.jsonl')==fullgen['structuralDiagnostic']['sha256']
assert sha(T/'structural-rows.jsonl')==taggen['structural']['sha256']
rp=Path('/root/.cache/babble-coverage-next/reading-policy/union-all.candidates.json');assert sha(rp)=='aaed131653f4b9dfa326e23db21451f24e9cda7d8005c8edb29728b44deb3a39'
# All complete corpora validated; only now open fixed comparators.
refp=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml');assert sha(refp)=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
ref=set()
for l in refp.read_text().splitlines():
 f=l.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
refchars={c for c,k in ref};ixp=Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json');assert sha(ixp)==ixp.stem
ix=json.loads(ixp.read_text());ref4={(c,t.rstrip('-+*').upper()) for c,v in ix.items() for t in v['1'].split() if re.fullmatch('[a-zA-Z]{4}[-+*]*',t)};official={c for c,k in ref4}|refchars
base={(r['char'],r['code']) for r in json.loads((B/'baseline-candidates.json').read_text())['records']};bm=base&ref;bmc={c for c,k in bm}
reading=json.loads(rp.read_text());readpairs={(r[0],r[1]) for r in reading['rows']};rm=readpairs&ref;rmc={c for c,k in rm}
four=set(json.loads(Path('/root/.cache/babble-coverage-research/local/current-target-inventory.json').read_text())['trainingCharacters'])|{r['char'] for r in json.loads(Path('/mnt/d/document/research/alive_babble/xiaohe-learn/src/data/generated/four-code-coverage.json').read_text())['records']}
uni=set()
for l in Path('/root/.cache/babble-coverage-research/benchmarks/PropList-18.0.0.txt').read_text().splitlines():
 raw=l.split('#')[0].strip()
 if not raw:continue
 rr,p=map(str.strip,raw.split(';'))
 if p=='Unified_Ideograph':rs=rr.split('..');uni.update(chr(n) for n in range(int(rs[0],16),int(rs[-1],16)+1))
fixed=base.copy();full=base|readpairs;tagfixed=set();tagfull=set();fixedm=bm.copy();fullm=bm|rm;tagstats=[];tw={}
for kind,name,path,row in corpora:
 pairs=set();m=set();targetparts=defaultdict(set)
 for l in path.open():
  r=json.loads(l);p=(r['char'],r['code']);pairs.add(p)
  if r['char'] in uni:targetparts[r['char']].add(tuple(r['parts']))
  if p in ref:m.add(p)
  if kind=='tag' and p in ref:tw.setdefault((name,p),r)
 if kind=='fixed':fixed|=pairs;fixedm|=m
 elif kind=='full':full|=pairs;fullm|=m
 elif name=='fixed-reading':tagfixed=pairs
 else:tagfull=pairs
 if kind=='tag':
  pc=Counter(c for c,k in pairs);tagstats.append({**row,'exactChars':len({c for c,k in m}),'exactPairs':len(m),'unicode18CandidateChars':len(set(pc)&uni),'unicode18AmbiguousChars':sum(n>1 for c,n in pc.items() if c in uni),'unicode18MaxCandidates':max((n for c,n in pc.items() if c in uni),default=0),'unicode18MaxDecompositions':max(map(len,targetparts.values()),default=0)})
oldfixed=fixed.copy();oldfull=full.copy();oldfixedm=fixedm.copy();oldfullm=fullm.copy();fixed|=tagfixed;fixedm|=tagfixed&ref;full|=tagfull;fullm|=tagfull&ref
fc={c for c,k in fixed};fmc={c for c,k in fixedm};ac={c for c,k in full};amc={c for c,k in fullm};oldfc={c for c,k in oldfixed};oldfmc={c for c,k in oldfixedm};oldamc={c for c,k in oldfullm};finalunion=four|amc
sourcekeys=set(fullgen['structuralDiagnostic']['allSourceKeys'])|set(taggen['structural']['sourceKeys']);structkeys=set(fullgen['structuralDiagnostic']['structuralKeys']);structpaths=[I/'structural-rows.jsonl',T/'structural-rows.jsonl']
for l in (T/'structural-rows.jsonl').open():structkeys.add(json.loads(l)['char'])
classes={k:set() for k in ['noAuditedSourceKey','sourcePresentNoPermitted23Cut','structuralCutButNoCompleteReadingChoices','hasCandidatesNoExactMirrorPair']}
for c in official-finalunion:
 cat='hasCandidatesNoExactMirrorPair' if c in ac else 'noAuditedSourceKey' if c not in sourcekeys else 'sourcePresentNoPermitted23Cut' if c not in structkeys else 'structuralCutButNoCompleteReadingChoices';classes[cat].add(c)
readable=set(json.loads(Path(fullgen['choices']['path']).read_text()));blockers=Counter();blockchars=defaultdict(set);blocked=0
for p in structpaths:
 for l in p.open():
  r=json.loads(l)
  if r['char'] not in classes['structuralCutButNoCompleteReadingChoices']:continue
  absent=set(r['parts'])-readable;assert absent;blocked+=1
  for x in absent:blockers[x]+=1;blockchars[x].add(r['char'])
counts=Counter(c for c,k in full);unicounts={c:n for c,n in counts.items() if c in uni};finalnew=fixedm-bm
summary={'scope':'External research only; final full-corpus union includes separately preregistered documented CJKVI suffix parsing. No product/source lock edits.','references':{'officialFourChars':len({c for c,k in ref4}),'officialFourPairs':len(ref4),'okChars':len(refchars),'okPairs':len(ref),'officialFourAndOKUnion':len(official),'currentFourAndOKUnion':len(four|refchars)},'baseline':{'exactChars':len(bmc),'exactPairs':len(bm),'fourChars':len(four),'fourAndExact':len(four|bmc)},'tagPolicy':tagstats,'fixedReadingFinal':{'candidateChars':len(fc),'candidatePairs':len(fixed),'exactChars':len(fmc),'exactPairs':len(fixedm),'newExactCharsVsBaseline':len(fmc-bmc),'newExactPairsVsBaseline':len(fixedm-bm),'fourAndExactChars':len(four|fmc),'newAfterFourBaselineChars':len((four|fmc)-(four|bmc)),'tagOnlyAdditionalExactChars':len(fmc-oldfmc),'tagOnlyAdditionalExactPairs':len(fixedm-oldfixedm)},'fullReadingFinal':{'candidateChars':len(ac),'candidatePairs':len(full),'exactChars':len(amc),'exactPairs':len(fullm),'fourAndExactChars':len(finalunion),'newExactCharsVsBaseline':len(amc-bmc),'newExactPairsVsBaseline':len(fullm-bm),'newAfterFourBaselineChars':len(finalunion-(four|bmc)),'newAfterReadingOnlyChars':len(amc-rmc),'newAfterReadingOnlyPairs':len(fullm-rm),'newBeyondUnionSeparateStudiesChars':len(amc-(fmc|rmc)),'newBeyondUnionSeparateStudiesPairs':len(fullm-(fixedm|rm)),'tagOnlyAdditionalExactChars':len(amc-oldamc),'tagOnlyAdditionalExactPairs':len(fullm-oldfullm),'officialTargetMissing':len(official-finalunion),'officialTargetConfirmed':len(official&finalunion),'okMissing':len(refchars-amc),'okNoCandidates':len(refchars-ac),'unicode18Target':len(uni),'unicode18CandidateChars':len(ac&uni),'unicode18ExactChars':len(amc&uni),'unicode18FourOrExactChars':len(finalunion&uni),'unicode18NoCandidate':len(uni-ac),'unicode18OutsideOfficialTarget':len(uni-official),'unicode18OutsideOfficialTargetCandidates':len((uni-official)&ac),'unicode18OutsideOfficialTargetNoCandidate':len((uni-official)-ac),'unicode18AmbiguousCandidateChars':sum(n>1 for n in unicounts.values()),'unicode18MaxCandidatePairsPerCharacter':max(unicounts.values()),'unicode18MostAmbiguous':[{'char':c,'pairs':n} for c,n in sorted(unicounts.items(),key=lambda x:-x[1])[:8]],'nonUnicode18CandidateChars':len(ac-uni)},'remainingOfficialTarget':{k:{'chars':len(v),'unicode18Chars':len(v&uni),'examples':''.join(sorted(v,key=ord)[:20])} for k,v in classes.items()},'readingBlockers':{'rows':blocked,'parts':len(blockers),'top':[{'part':p,'rows':n,'chars':len(blockchars[p])} for p,n in blockers.most_common(25)]},'pins':{'fixedGenerationSummary':sha(B/'generation-summary.json'),'fullGenerationSummary':sha(I/'generation-summary.json'),'tagGenerationSummary':sha(T/'generation-summary.json'),'comparatorOK':sha(refp),'comparatorFour':sha(ixp),'readingFull':sha(rp)}}
(T/'final-comparison-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(T/'remaining-targets.json').write_text(json.dumps({k:''.join(sorted(v,key=ord)) for k,v in classes.items()},ensure_ascii=False,indent=2)+'\n')
(T/'tag-only-match-witnesses.jsonl').write_text(''.join(json.dumps({'policy':name,**r},ensure_ascii=False,separators=(',',':'))+'\n' for (name,p),r in tw.items() if p not in (oldfixedm if name=='fixed-reading' else oldfullm)))
print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
