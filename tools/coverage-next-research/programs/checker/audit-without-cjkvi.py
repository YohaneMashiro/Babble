"""Uniform provenance exclusion, complete generation before comparator access.
Do not reinterpret GPLv2-only declarations as GPLv3-compatible. No source,
decomposition, reading, or mirror-specific preference is introduced.
"""
from pathlib import Path
import json,hashlib,itertools,math,collections
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');BASE=Path('/root/.cache/babble-coverage-next');OUT=BASE/'checker'
choicepath=BASE/'reading-policy/equivalent-glyph-transfer/transferred-component-choices.json';structpath=BASE/'decomposition/interaction/structural-rows.jsonl';rawpath=ROOT/'tools/component-spelling/inputs/radical.yaml'
choices=json.loads(choicepath.read_text())
def rows():
 for no,line in enumerate(rawpath.read_text().splitlines(),1):
  if not line or line.startswith('#'):continue
  c,parts=line.split('\t');yield {'char':c,'parts':parts.split(),'policy':'raw-radical'},str(rawpath),no
 for no,line in enumerate(structpath.open(),1):
  r=json.loads(line)
  if r['policy'].startswith('cjkvi'):continue
  yield r,str(structpath),no
seen=set();counter=collections.Counter();maximum=0;candidatepath=OUT/'without-cjkvi-complete-candidates.jsonl'
with candidatepath.open('w') as f:
 for row,path,no in rows():
  counter['sourceRows']+=1;parts=row['parts'];c=row['char']
  if len(parts) not in (2,3) or any(len(p)!=1 or 0xd800<=ord(p)<=0xdfff for p in parts):counter['rejectedPartCountOrScalar']+=1;continue
  options=[choices.get(p,[]) for p in parts]
  if any(not a for a in options):counter['rejectedMissingChoices']+=1;continue
  combos=math.prod(map(len,options));maximum=max(maximum,combos)
  if combos>256:counter['rejectedCombinationLimit']+=1;continue
  counter['eligibleSourceRows']+=1
  for opts in itertools.product(*options):
   code='OK'+''.join(x['code'] for x in opts);pair=(c,code)
   if pair in seen:continue
   seen.add(pair);f.write(json.dumps([c,code,parts,{'policy':row['policy'],'sourcePath':path,'sourceLine':no}],ensure_ascii=False,separators=(',',':'))+'\n')
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest={'policy':'uniform exclusion of all CJKVI structural source witnesses; same frozen broad choices plus equivalent-glyph mnemonic transfer','generatedBeforeComparator':True,'inputs':[{'path':str(p),'sha256':sha(p)} for p in [choicepath,structpath,rawpath,Path(__file__)]],'candidatePath':str(candidatepath),'candidateSha256':sha(candidatepath),'candidatePairs':len(seen),'candidateCharacters':len({c for c,k in seen}),'maximumCombinations':maximum,'counts':dict(counter)}
(OUT/'without-cjkvi-generation-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Complete candidate file and manifest now exist; only here open the comparator.
refpath=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml');assert sha(refpath)=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
import re
ref=set()
for line in refpath.read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
exact=seen&ref;exactchars={c for c,k in exact};four=set(json.loads((OUT/'production-four-characters.json').read_text()));common=json.loads((OUT/'common-finite-independent-audit.json').read_text());finite={r['char'] for r in common['codeComparison'] if r['exact'] and not r['contextHeld']};union=four|exactchars
report={'status':'passed-source-exclusion-audit','candidateCharacters':manifest['candidateCharacters'],'candidatePairs':len(seen),'exactCharacters':len(exactchars),'exactPairs':len(exact),'fourAndExactCharacters':len(union),'withFiniteEndpointsCharacters':len(union|finite),'newAnyMethodVsProduction':len(union|finite)-60891,'completeGenerationBeforeComparator':True,'maximumCombinations':maximum,'counts':dict(counter),'scope':'Concrete source-separated handoff subset. This is provenance filtering, not an independent legal opinion or a production adoption.'}
(OUT/'without-cjkvi-actual-exact-pairs.json').write_text(json.dumps(sorted(exact),ensure_ascii=False)+'\n')
(OUT/'without-cjkvi-independent-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
