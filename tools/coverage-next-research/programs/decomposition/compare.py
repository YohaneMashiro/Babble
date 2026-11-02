#!/usr/bin/env python3
"""Compare only previously completed immutable candidates. No generation here."""
from pathlib import Path
from collections import Counter
import json,hashlib,re
OUT=Path('/root/.cache/babble-coverage-next/decomposition')
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn')
REF=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml')
assert hashlib.sha256(REF.read_bytes()).hexdigest()=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
GEN=json.loads((OUT/'generation-summary.json').read_text())
for row in GEN['policies']:assert hashlib.sha256((OUT/(row['policy']+'-candidates.jsonl')).read_bytes()).hexdigest()==row['sha256']
ref=set();started=False
for line in REF.read_text().splitlines():
 if line=='...':started=True;continue
 if not started or not line or line.startswith('#'):continue
 f=line.split('\t');ref.add((f[0],f[1].upper()))
refchars={x[0] for x in ref}
base=json.loads((OUT/'baseline-candidates.json').read_text())['records']
basepairs={(x['char'],x['code']) for x in base};basematch=basepairs&ref;basematchchars={x[0] for x in basematch};basechars={x[0] for x in basepairs}
four=set(json.loads(Path('/root/.cache/babble-coverage-research/local/current-target-inventory.json').read_text())['trainingCharacters'])
four|={x['char'] for x in json.loads((ROOT/'src/data/generated/four-code-coverage.json').read_text())['records']}
ixp=Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json')
assert hashlib.sha256(ixp.read_bytes()).hexdigest()==ixp.stem
ix=json.loads(ixp.read_text());officialfour={c for c,v in ix.items() if any(re.fullmatch('[a-zA-Z]{4}[-+*]*',t) for t in v['1'].split())}
known=refchars|officialfour
print('baseline',len(basechars),len(basepairs),len(basematchchars),len(basematch),'four+okconfirmed',len(four|basematchchars),'knownwithfour',len(known))
current=basepairs.copy(); cumulative_matches=basematch.copy();policy_results=[];all_witnesses={}
for row in GEN['policies']:
 name=row['policy'];recs=[json.loads(x) for x in (OUT/(name+'-candidates.jsonl')).read_text().splitlines()]
 pairs={(x['char'],x['code']) for x in recs};chars={x[0] for x in pairs};matches=pairs&ref;matchchars={x[0] for x in matches}
 incremental=matches-basematch;incrementalchars=matchchars-basematchchars
 newcum=matches-cumulative_matches;newcumchars=matchchars-{x[0] for x in cumulative_matches}
 witness={ (x['char'],x['code']):x for x in recs if (x['char'],x['code']) in incremental}
 for k,v in witness.items():all_witnesses.setdefault(k,{'policy':name,**v})
 result={**row,'referenceOverlapChars':len(chars&refchars),'exactMatchChars':len(matchchars),'exactMatchPairs':len(matches),'incrementalMatchCharsVsFixedBaseline':len(incrementalchars),'incrementalMatchPairsVsFixedBaseline':len(incremental),'candidateCharsNewVsFixedBaseline':len(chars-basechars),'candidatePairsNewVsFixedBaseline':len(pairs-basepairs),'cumulativeIncrementalMatchCharsThisPolicy':len(newcumchars),'cumulativeIncrementalMatchPairsThisPolicy':len(newcum),'missingTargetCharsWithNoCandidate':len(refchars-(chars|basechars)),'fourCodeAndBaselineAndPolicyConfirmed':len(four|basematchchars|matchchars),'compoundEquivalenceWitnessPairs':sum(bool(x['equivalences']) for x in recs),'newMatchChars':''.join(sorted(incrementalchars,key=ord))}
 policy_results.append(result);current|=pairs;cumulative_matches|=matches
 print(json.dumps({k:v for k,v in result.items() if k not in ['newMatchChars','sourceStats']},ensure_ascii=False),flush=True)
uni=set()
for line in Path('/root/.cache/babble-coverage-research/benchmarks/PropList-18.0.0.txt').read_text().splitlines():
 raw=line.split('#')[0].strip()
 if not raw:continue
 rr,prop=map(str.strip,raw.split(';'))
 if prop!='Unified_Ideograph':continue
 n=rr.split('..');a=int(n[0],16);b=int(n[-1],16);uni.update(chr(i) for i in range(a,b+1))
allchars={x[0] for x in current};exactchars={x[0] for x in cumulative_matches};known=refchars|officialfour
summary={'reference':{'chars':len(refchars),'pairs':len(ref),'sha256':hashlib.sha256(REF.read_bytes()).hexdigest()},'baseline':{'candidateChars':len(basechars),'candidatePairs':len(basepairs),'exactChars':len(basematchchars),'exactPairs':len(basematch),'fourCodeChars':len(four),'fourAndOKExactChars':len(four|basematchchars),'knownOfficialUnion':len(known),'currentFourAndOKUnion':len(four|refchars),'officialFourReferenceSha256':hashlib.sha256(ixp.read_bytes()).hexdigest()},'policies':policy_results,'combined':{'candidateChars':len(allchars),'candidatePairs':len(current),'exactChars':len(exactchars),'exactPairs':len(cumulative_matches),'newExactCharsVsFixedBaseline':len(exactchars-basematchchars),'newExactPairsVsFixedBaseline':len(cumulative_matches-basematch),'fourAndOKExactChars':len(four|exactchars),'newConfirmedAnyMethodVsFixedBaseline':len((four|exactchars)-(four|basematchchars)),'missingKnownOfficialUnion':len(known-(four|exactchars)),'missingOKTargetChars':len(refchars-exactchars),'missingOKNoCandidate':len(refchars-allchars),'missingOKHasCandidateButNoExact':len((refchars&allchars)-exactchars),'unicode18TargetChars':len(uni),'unicode18CandidateChars':len(uni&allchars),'unicode18ExactChars':len(uni&exactchars),'unicode18FourAndOKExactChars':len(uni&(four|exactchars))}}
(OUT/'comparison-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(OUT/'incremental-match-witnesses.jsonl').write_text(''.join(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n' for k,v in sorted(all_witnesses.items(),key=lambda x:(ord(x[0][0]),x[0][1]))))
# Restricted external difference artifact includes comparator-only targets, never vendored.
diffs={'baselineOKMissing':''.join(sorted(refchars-basematchchars,key=ord)),'combinedOKMissing':''.join(sorted(refchars-exactchars,key=ord)),'combinedMissingNoCandidate':''.join(sorted(refchars-allchars,key=ord)),'combinedMissingWithDifferentCandidates':''.join(sorted((refchars&allchars)-exactchars,key=ord)),'missingKnownOfficial':''.join(sorted(known-(four|exactchars),key=ord)),'newExactVsBaseline':''.join(sorted(exactchars-basematchchars,key=ord))}
(OUT/'missing-target-diff.json').write_text(json.dumps(diffs,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary['combined'],ensure_ascii=False))
