from pathlib import Path
import json,hashlib,re,collections,itertools
B=Path('/root/.cache/babble-coverage-next/decomposition');O=Path('/root/.cache/babble-coverage-next/checker');T=B/'tagged-cjkvi'
# Reuse the checker's independent source-witness validator, not research generation code.
ns={};exec(compile((O/'audit-decomposition.py').read_text().split('basejson=')[0],str(O/'audit-decomposition.py'),'exec'),ns)
originaltree=ns['tree']
ns['tree']=lambda expr:originaltree(re.sub(r'(?:\[[A-Z]+\])+$','',expr))
tree=ns['tree'];source_expr=ns['source_expr'];cuts=ns['cuts']
gen=json.loads((T/'generation-summary.json').read_text());claimed=json.loads((T/'final-comparison-summary.json').read_text())
fixed=json.loads((B/'sound-choices.json').read_text());full=json.loads(Path('/root/.cache/babble-coverage-next/reading-policy/union-all-component-choices.json').read_text())
def loadpairs(p):
 return {(r['char'],r['code']) for r in (json.loads(l) for l in p.open())}
def loadgroups(parent):
 out=set()
 for row in json.loads((parent/'generation-summary.json').read_text())['policies']:out|=loadpairs(parent/(row['policy']+'-candidates.jsonl'))
 return out
base=json.loads((B/'baseline-candidates.json').read_text());basepairs={(r['char'],r['code']) for r in base['records']}
reading=json.loads(Path('/root/.cache/babble-coverage-next/reading-policy/union-all.candidates.json').read_text());readingpairs={(r[0],r[1]) for r in reading['rows']}
fixedpairs=basepairs|loadgroups(B);fullpairs=basepairs|readingpairs|loadgroups(B/'interaction');tagsets={}
for policy in gen['policies']:
 name=policy['policy'];p=T/(name+'-candidates.jsonl');h=hashlib.sha256()
 with p.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 assert h.hexdigest()==policy['sha256'] and p.stat().st_size==policy['bytes']
 options=fixed if name=='fixed-reading' else full;pairs=set()
 for line in p.open():
  r=json.loads(line);char=r['char'];parts=tuple(r['parts']);w=r['witness'];eq={}
  assert w['expression'] in source_expr(w,char).split(';')
  for e in r['equivalences']:
   assert e['expression'] in source_expr(e,e['char']).split(';');eq.setdefault(tree(e['expression']),set()).add(e['char'])
  assert parts in cuts(tree(w['expression']),eq)
  assert len(parts) in (2,3) and char not in parts
  for part,c in zip(parts,r['components']):assert c in options[part]
  assert len(parts)==len(r['components']) and r['code']=='OK'+''.join(c['code'] for c in r['components'])
  pair=(char,r['code']);assert pair not in pairs;pairs.add(pair)
 assert len(pairs)==policy['candidatePairs'] and len({c for c,k in pairs})==policy['candidateCharacters'];tagsets[name]=pairs
 print(name,'all tagged pair provenance verified',len(pairs),flush=True)
ref=set()
for line in Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml').read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
four=set(json.loads((O/'production-four-characters.json').read_text()));baseexact=basepairs&ref;basechars={c for c,k in baseexact}
ix=json.loads(Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json').read_text());officialfour={c for c,v in ix.items() if any(re.fullmatch('[a-zA-Z]{4}[-+*]*',x) for x in v['1'].split())};known={c for c,k in ref}|officialfour
u=set()
for line in Path('/root/.cache/babble-coverage-research/benchmarks/PropList-18.0.0.txt').read_text().splitlines():
 raw=line.split('#')[0].strip()
 if not raw:continue
 rr,prop=map(str.strip,raw.split(';'))
 if prop=='Unified_Ideograph':
  n=rr.split('..');u.update(chr(i) for i in range(int(n[0],16),int(n[-1],16)+1))
results={}
for key,pairs in [('fixed',fixedpairs|tagsets['fixed-reading']),('full',fullpairs|tagsets['union-all-reading'])]:
 exact=pairs&ref;chars={c for c,k in exact};allchars={c for c,k in pairs};union=four|chars;counter=collections.Counter(c for c,k in pairs if c in u)
 r={'candidateCharacters':len(allchars),'candidatePairs':len(pairs),'exactCharacters':len(chars),'exactPairs':len(exact),'fourAndExactCharacters':len(union),'newAnyMethodCharacters':len(union-(four|basechars)),'newExactCharacters':len(chars-basechars),'knownOfficialMissing':len(known-union),'unicode18CandidateCharacters':len(u&allchars),'unicode18FourOrExact':len(u&union),'unicode18Missing':len(u-union),'unicode18NoCandidate':len(u-allchars),'unicode18AmbiguousCandidateCharacters':sum(n>1 for n in counter.values()),'unicode18MaxCandidatePairsPerCharacter':max(counter.values()),'outsideUnicode18Candidates':len(allchars-u)}
 s=claimed['fixedReadingFinal' if key=='fixed' else 'fullReadingFinal']
 assert r['exactCharacters']==s['exactChars'] and r['exactPairs']==s['exactPairs'] and r['candidatePairs']==s['candidatePairs'] and r['fourAndExactCharacters']==s['fourAndExactChars']
 results[key]=r
 if key=='full':
  (O/'final-actual-exact-pairs.json').write_text(json.dumps(sorted(exact),ensure_ascii=False)+'\n')
  (O/'final-actual-candidate-characters.json').write_text(json.dumps(sorted(allchars,key=ord),ensure_ascii=False)+'\n')
  missing=known-union
  structgen=json.loads((B/'interaction/generation-summary.json').read_text());sourcekeys=set(structgen['structuralDiagnostic']['allSourceKeys']);structkeys=set()
  for sp in [B/'interaction/structural-rows.jsonl',T/'structural-rows.jsonl']:
   for line in sp.open():structkeys.add(json.loads(line)['char'])
  classes={'noAuditedSourceKey':set(),'sourcePresentNoPermitted23Cut':set(),'structuralCutButNoCompleteReadingChoices':set(),'hasCandidatesNoExactMirrorPair':set()}
  for c in missing:
   key2='hasCandidatesNoExactMirrorPair' if c in allchars else 'noAuditedSourceKey' if c not in sourcekeys else 'sourcePresentNoPermitted23Cut' if c not in structkeys else 'structuralCutButNoCompleteReadingChoices'
   classes[key2].add(c)
  reported=json.loads((T/'remaining-targets.json').read_text())
  assert {k:set(v) for k,v in reported.items()}==classes
  results['remainingOfficialTargetClasses']={k:len(v) for k,v in classes.items()}
(O/'tagged-final-independent-audit.json').write_text(json.dumps({'status':'passed','results':results},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False))
