#!/usr/bin/env python3
"""Compare complete pinned single-expansion corpus; no generation here."""
from pathlib import Path
from collections import Counter
import json,hashlib,re,time,resource,sys
B=Path('/root/.cache/babble-coverage-next/decomposition');O=B/'leaf-expansion';E=Path('/root/.cache/babble-coverage-next/reading-policy/equivalent-glyph-transfer');R=Path('/mnt/d/document/research/alive_babble/xiaohe-learn')
EXCLUDE_CJKVI='--no-cjkvi' in sys.argv
if EXCLUDE_CJKVI:O=O/'no-cjkvi'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
start=time.monotonic();g=json.loads((O/'generation-summary.json').read_text());assert g['generatedWithoutComparator'];assert sha(B/'leaf-expansion/run.py')==g['generatorSha256'];assert sha(O/'preregistration.json')==g['preregistrationSha256']
for pin in g['artifacts']:assert sha(Path(pin['path']))==pin['sha256']
oldp=Path('/root/.cache/babble-coverage-next/checker/without-cjkvi-complete-candidates.jsonl') if EXCLUDE_CJKVI else E/'joint-transferred.candidates.jsonl'
assert sha(oldp)==('7d98b649d68e65778c894961f3479fbe038a5a5c89d9a4d19c60383406bacfe3' if EXCLUDE_CJKVI else '7c55c3deb64bc36ed950f0ba70d2766b02ed3b88f598fe8b73dbd88c6e6ea1b9')
# All complete candidate artifacts checked. Comparator access starts here.
refp=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml');assert sha(refp)=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
ref=set()
for l in refp.read_text().splitlines():
 f=l.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
refchars={c for c,k in ref};oldpairs=set()
for l in oldp.open():r=json.loads(l);oldpairs.add((r[0],r[1]))
oldm=oldpairs&ref;oldmc={c for c,k in oldm};assert len(oldm)==(62643 if EXCLUDE_CJKVI else 63253) and len(oldmc)==(62634 if EXCLUDE_CJKVI else 63244)
basefour=json.loads((B/'tagged-cjkvi/final-exact-pairset.json').read_text());four=set(basefour['fourCharacters']);oldunion=four|oldmc;assert len(oldunion)==(63494 if EXCLUDE_CJKVI else 64096)
ixp=Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json');assert sha(ixp)==ixp.stem
ix=json.loads(ixp.read_text());official={c for c,v in ix.items() if any(re.fullmatch('[a-zA-Z]{4}[-+*]*',t) for t in v['1'].split())}|refchars
pairs=set();m=set();witnesses={}
for l in (O/'candidates.jsonl').open():
 r=json.loads(l);p=(r['char'],r['code']);pairs.add(p)
 if p in ref:
  m.add(p)
  if p not in oldm:witnesses[p]=r
mc={c for c,k in m};allpairs=oldpairs|pairs;allm=oldm|m;ac={c for c,k in allpairs};amc={c for c,k in allm};union=four|amc
uni=set()
for l in Path('/root/.cache/babble-coverage-research/benchmarks/PropList-18.0.0.txt').read_text().splitlines():
 raw=l.split('#')[0].strip()
 if not raw:continue
 rr,p=map(str.strip,raw.split(';'))
 if p=='Unified_Ideograph':rs=rr.split('..');uni.update(chr(n) for n in range(int(rs[0],16),int(rs[-1],16)+1))
fg=json.loads((B/'interaction/generation-summary.json').read_text());sourcekeys=set().union(*(set(cs) for name,cs in fg['sourceMembership'].items() if not EXCLUDE_CJKVI or 'cjkvi' not in name));structkeys=set()
for p in [B/'interaction/structural-rows.jsonl',B/'tagged-cjkvi/structural-rows.jsonl',O/'expanded-structural-rows.jsonl']:
 for l in p.open():
  r=json.loads(l)
  if EXCLUDE_CJKVI and 'witness' in r and any('cjkvi--cjkvi-ids' in x.get('file','') for x in [r['witness'],*r['equivalences']]):continue
  structkeys.add(r['char'])
finitep=Path('/root/.cache/babble-coverage-next/common/finite-candidates-before-comparison.json');assert sha(finitep)=='a7f9291d4774738b811055ebc35b8d465f88c0e948322eeaa5b858a7ab76a317'
# Six independently generated and separately checker-admitted ordinary four-code characters.
finite=set('升断见生继夜');finite_before=oldunion|finite;finite_after=union|finite
missing=official-finite_after;classes={k:set() for k in ['noAuditedSourceKey','sourcePresentNoPermitted23Cut','structuralCutButNoCompleteReadingChoices','hasCandidatesNoExactMirrorPair']}
for c in missing:
 cat='hasCandidatesNoExactMirrorPair' if c in ac else 'noAuditedSourceKey' if c not in sourcekeys else 'sourcePresentNoPermitted23Cut' if c not in structkeys else 'structuralCutButNoCompleteReadingChoices';classes[cat].add(c)
reps=json.loads(Path('/root/.cache/babble-coverage-research/benchmarks/repertoires.json').read_text())['properties'];effects={}
for k in ['kTGH','kGB0','kBigFive']:
 target={r['char'] for r in reps[k]};effects[k]={'target':len(target),'before':len(target&oldunion),'after':len(target&union),'added':len(target&(union-oldunion)),'beforeWithFinite':len(target&finite_before),'afterWithFinite':len(target&finite_after)}
readings=json.loads((R/'src/data/generated/readings.json').read_text())['characters'];text=(R/'the_Tower_of_Babel.txt').read_text();han=[c for c in text if c in readings];assert len(han)==1840
hy={'targetOccurrences':len(han),'before':sum(c in oldunion for c in han),'after':sum(c in union for c in han),'newCharacters':[{'char':c,'occurrences':han.count(c)} for c in sorted(set(han)&(union-oldunion),key=ord)],'beforeWithFinite':sum(c in finite_before for c in han),'afterWithFinite':sum(c in finite_after for c in han)}
pc=Counter(c for c,k in allpairs)
summary={'excludeDirectCJKVIParentAndChild':EXCLUDE_CJKVI,'scope':'Single source-backed named-leaf expansion; complete corpus prewritten/hash-verified before comparator; research only','reference':{'officialTarget':len(official),'okChars':len(refchars),'okPairs':len(ref),'okSha256':sha(refp)},'before':{'candidateChars':len({c for c,k in oldpairs}),'candidatePairs':len(oldpairs),'exactChars':len(oldmc),'exactPairs':len(oldm),'fourAndExact':len(oldunion)},'expansionOnly':{'candidateChars':len({c for c,k in pairs}),'candidatePairs':len(pairs),'exactChars':len(mc),'exactPairs':len(m),'newExactChars':len(mc-oldmc),'newExactPairs':len(m-oldm),'newFourUnionChars':len(union-oldunion)},'combined':{'candidateChars':len(ac),'candidatePairs':len(allpairs),'exactChars':len(amc),'exactPairs':len(allm),'fourAndExact':len(union),'netAddedVs60891Baseline':len(union)-60891,'officialTargetMissingBeforeFinite':len(official-union),'officialTargetMissingAfterFinite':len(missing),'unicode18CandidateChars':len(ac&uni),'unicode18FourAndExact':len(union&uni),'unicode18NoCandidates':len(uni-ac),'nonUnicode18CandidateChars':len(ac-uni),'candidatePairRatioToPrevious':len(allpairs)/len(oldpairs),'additionalCandidatePairs':len(allpairs-oldpairs),'unicode18AmbiguousChars':sum(n>1 for c,n in pc.items() if c in uni),'unicode18MaximumCandidatePairs':max(n for c,n in pc.items() if c in uni)},'withFiniteCommon':{'acceptedCharacters':''.join(sorted(finite,key=ord)),'candidatePin':sha(finitep),'beforeUnion':len(finite_before),'afterUnion':len(finite_after),'leafNetAddedAfterFinite':len(finite_after-finite_before),'finiteAdditionalAfterLeaf':len(finite_after-union),'officialTargetMissing':len(missing),'netAddedVs60891Baseline':len(finite_after)-60891,'unicode18FourAndExact':len(finite_after&uni)},'remainingOfficial':{k:len(v) for k,v in classes.items()},'normative':effects,'hy':hy,'pins':{'generationSummarySha256':sha(O/'generation-summary.json'),'previousCandidatesSha256':sha(oldp)},'comparisonWallSeconds':time.monotonic()-start,'comparisonMaxResidentMemoryKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
(O/'comparison-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(O/'incremental-match-witnesses.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for p,r in sorted(witnesses.items(),key=lambda kv:(ord(kv[0][0]),kv[0][1]))))
(O/'remaining-targets.json').write_text(json.dumps({k:''.join(sorted(v,key=ord)) for k,v in classes.items()},ensure_ascii=False,indent=2)+'\n')
(O/'final-exact-pairset.json').write_text(json.dumps({'scope':'COMPARISON ONLY, never a generation input','pairs':sorted(allm,key=lambda p:(ord(p[0]),p[1])),'fourCharacters':''.join(sorted(four,key=ord))},ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
