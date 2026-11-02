from pathlib import Path
import json,hashlib,re,collections,itertools,sys
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');HERE=Path('/root/.cache/babble-coverage-next/decomposition');OUT=Path('/root/.cache/babble-coverage-next/checker')
sha=lambda b:hashlib.sha256(b).hexdigest()
pins=json.loads((HERE/'sources/manifest.json').read_text());sourcechecks=[]
for pin in pins:
 p=HERE/'sources'/pin['repo'].replace('/','--')/pin['file'];b=p.read_bytes();assert sha(b)==pin['sha256'] and len(b)==pin['bytes'],str(p)
 assert '/'+pin['commit']+'/' in pin['url'] and len(pin['commit'])==40
 sourcechecks.append({'path':str(p),'sha256':sha(b),'bytes':len(b)})
interaction='--interaction' in sys.argv
POLICYDIR=HERE/'interaction' if interaction else HERE
summary=json.loads((POLICYDIR/'generation-summary.json').read_text());claimed=json.loads((POLICYDIR/'comparison-summary.json').read_text())
choicepath=Path('/root/.cache/babble-coverage-next/reading-policy/union-all-component-choices.json') if interaction else HERE/'sound-choices.json'
choices=json.loads(choicepath.read_text());sounds=json.loads((OUT/'sound-results.json').read_text());props=json.loads((OUT/'independent-properties.json').read_text())
for part,opts in choices.items():
 for c in opts:assert c['part']==part and sounds[c['pinyin']]==c['code']
contents={};linecache={};parsecache={}
def getlines(p):
 if p not in linecache:linecache[p]=Path(p).read_text().splitlines()
 return linecache[p]
def source_expr(w,char,flat=False):
 f=getlines(w['file'])[w['line']-1].split('\t')
 assert char==f[0 if flat or '/yi-bai--ids/' in w['file'] or '/libre-flypy-audit/' in w['file'] else 1]
 return f[w['column']-1]
arity={chr(x):2 for x in range(0x2ff0,0x3000)};arity.update({'⿲':3,'⿳':3,'⿾':1,'⿿':1,'㇯':2})
def tree(expr):
 expr=re.sub(r'(?:\([^()]*\))+$','',expr)
 stack=[]
 for c in reversed(expr):
  if c in arity:
   n=arity[c];assert len(stack)>=n
   stack.append((c,tuple(stack.pop() for _ in range(n))))
  else:stack.append(c)
 assert len(stack)==1
 return stack[0]
def cuts(t,eq):
 if isinstance(t,str):return {(t,)}
 out={(p,) for p in eq.get(t,())}
 for parts in itertools.product(*(cuts(c,eq) for c in t[1])):
  flat=tuple(itertools.chain.from_iterable(parts))
  if len(flat)<=3:out.add(flat)
 return out
def flatten(t):return [t] if isinstance(t,str) else list(itertools.chain.from_iterable(flatten(c) for c in t[1]))
basejson=json.loads((HERE/'baseline-candidates.json').read_text());basepairs={(x['char'],x['code']) for x in basejson['records']}
readingbase=json.loads(Path('/root/.cache/babble-coverage-next/reading-policy/baseline.candidates.json').read_text())
assert basepairs=={(r[0],r[1]) for r in readingbase['rows']}
allpairs=basepairs.copy();results=[];policypairs={}
if interaction:
 broad=json.loads(Path('/root/.cache/babble-coverage-next/reading-policy/union-all.candidates.json').read_text())
 allpairs|={(r[0],r[1]) for r in broad['rows']}
for policy in summary['policies']:
 name=policy['policy'];p=POLICYDIR/(name+'-candidates.jsonl');h=hashlib.sha256()
 with p.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 assert h.hexdigest()==policy['sha256'] and p.stat().st_size==policy['bytes']
 pairs=set();chars=set();eqcount=0;maxcombo=0
 for line in p.open():
  r=json.loads(line);char=r['char'];code=r['code'];parts=tuple(r['parts']);w=r['witness'];eqs=r['equivalences']
  assert (char,code) not in pairs;pairs.add((char,code));chars.add(char)
  assert len(parts) in (2,3) and all(len(x)==1 for x in parts)
  assert code=='OK'+''.join(c['code'] for c in r['components'])
  assert len(r['components'])==len(parts)
  for part,c in zip(parts,r['components']):assert c in choices[part]
  if name.startswith('flat-'):
   rawparts=tuple(source_expr(w,char,True).split());equiv={}
   for e in eqs:
    ep=tuple(source_expr(e,e['char'],True).split());equiv.setdefault(ep,set()).add(e['char'])
   if name=='flat-explicit-alternatives':assert parts==rawparts and not eqs
   else:
    assert 4<=len(rawparts)<=12
    valid=False
    for ns in itertools.combinations(range(1,len(rawparts)),len(parts)-1):
     pts=(0,)+ns+(len(rawparts),)
     if all((rawparts[i:j]==(part,) if j-i==1 else part in equiv.get(rawparts[i:j],set())) for part,i,j in zip(parts,pts,pts[1:])):valid=True;break
    assert valid
  else:
   raw=source_expr(w,char);assert w['expression'] in raw.split(';')
   t=tree(w['expression']);equiv={}
   for e in eqs:
    assert e['expression'] in source_expr(e,e['char']).split(';');et=tree(e['expression']);equiv.setdefault(et,set()).add(e['char'])
   assert parts in cuts(t,equiv) and char not in parts
  eqcount+=bool(eqs)
 assert len(pairs)==policy['candidatePairs'] and len(chars)==policy['candidateCharacters']
 policypairs[name]=pairs;allpairs|=pairs
 results.append({'policy':name,'candidateCharacters':len(chars),'candidatePairs':len(pairs),'allPairCodeAndSourceWitnessesVerified':True,'compoundEquivalenceWitnessPairs':eqcount})
 print(name,'complete provenance verified',len(pairs),flush=True)
refpath=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml');assert sha(refpath.read_bytes())=='510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'
ref=set()
for line in refpath.read_text().splitlines():
 f=line.split('\t')
 if len(f)>1 and len(f[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',f[1]):ref.add((f[0],f[1].upper()))
baseexact=basepairs&ref;basechars={c for c,k in baseexact};refchars={c for c,k in ref};exact=allpairs&ref;exactchars={c for c,k in exact};allchars={c for c,k in allpairs}
four=set(json.loads((OUT/'production-four-characters.json').read_text()))
ix=json.loads(Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json').read_text());officialfour={c for c,v in ix.items() if any(re.fullmatch('[a-zA-Z]{4}[-+*]*',x) for x in v['1'].split())};known=officialfour|refchars
for r,s in zip(results,claimed['policies']):
 matches=policypairs[r['policy']]&ref;chars={c for c,k in matches}
 r.update({'exactCharacters':len(chars),'exactPairs':len(matches),'newExactCharactersVsBaseline':len(chars-basechars),'newExactPairsVsBaseline':len(matches-baseexact)})
 assert r['exactCharacters']==s.get('exactMatchChars',s.get('exactChars')) and r['exactPairs']==s.get('exactMatchPairs',s.get('exactPairs')) and r['newExactCharactersVsBaseline']==s.get('incrementalMatchCharsVsFixedBaseline',s.get('newExactCharsVsFixedBaseline'))
union=four|exactchars
combined={'candidateCharacters':len(allchars),'candidatePairs':len(allpairs),'exactCharacters':len(exactchars),'exactPairs':len(exact),'newExactCharactersVsBaseline':len(exactchars-basechars),'newExactPairsVsBaseline':len(exact-baseexact),'fourAndExactCharacters':len(union),'newAnyMethodCharacters':len(union-(four|basechars)),'knownOfficialUnion':len(known),'missingKnownOfficial':len(known-union),'missingOK':len(refchars-exactchars),'missingOKNoCandidate':len(refchars-allchars),'missingOKCandidateNoExact':len((refchars&allchars)-exactchars)}
assert combined['exactCharacters']==claimed['combined']['exactChars'] and combined['candidatePairs']==claimed['combined']['candidatePairs']
label='interaction' if interaction else 'decomposition'
(OUT/(label+'-independent-audit.json')).write_text(json.dumps({'status':'passed','sourcePins':sourcechecks,'policies':results,'combined':combined},ensure_ascii=False,indent=2)+'\n')
(OUT/(label+'-actual-exact-pairs.json')).write_text(json.dumps(sorted(exact),ensure_ascii=False)+'\n')
print(json.dumps(combined,ensure_ascii=False))
