from pathlib import Path
import json,hashlib,re,ast
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');HERE=Path('/root/.cache/babble-coverage-next/common');OUT=Path('/root/.cache/babble-coverage-next/checker')
p=HERE/'finite-candidates-before-comparison.json';b=p.read_bytes();sha=hashlib.sha256(b).hexdigest();assert sha==(HERE/'finite-candidates-before-comparison.sha256').read_text().strip();g=json.loads(b)
for pin in g['sourcePins']:
 raw=Path(pin['path']).read_bytes();assert len(raw)==pin['bytes'] and hashlib.sha256(raw).hexdigest()==pin['sha256']
sounds=json.loads((OUT/'sound-results.json').read_text());props=json.loads((OUT/'independent-properties.json').read_text());selection=json.loads((HERE/'endpoint-selection-preregistered.json').read_text())['choices'];roots=(ROOT/'tools/libre-flypy-audit/src/roots.rs').read_text().splitlines();zg=Path('/root/.cache/babble-coverage-research/official/zg.md').read_text()
expected={'无':('stroke:horizontal','component:you-without-dot'),'生':('stroke:left-falling','component:qing-top-gong'),'大':('component:zuo-top','stroke:right-falling'),'见':('component:open-bottom-frame','named-component:jian-lower'),'升':('stroke:left-falling','component:gong'),'断':('small-root:mi','small-root:jin'),'继':('component:silk-left','stroke:vertical-turn'),'夜':('component:wen-top','stroke:right-falling')}
generated=set()
for r in g['records']:
 c=r['char'];assert (r['first']['id'],r['last']['id'])==expected[c];assert r['strokeSelection']==selection[c]
 strokes=json.loads((HERE/('sources/writer-'+c+'.json')).read_text());parts=[r['strokeSelection'][k] for k in ['first','last','unexpanded']];allindices=sum(parts,[])
 assert sorted(allindices)==list(range(len(strokes['strokes']))) and len(set(allindices))==len(allindices)==r['sourceStrokeCount']
 for root in [r['first'],r['last']]:
  if root['glyph']:
   assert root['rootSourceLines'] and all("('"+root['glyph']+"', '"+root['key'].lower()+"')" in roots[i-1] for i in root['rootSourceLines'])
  else:assert root['id']=='named-component:jian-lower' and root['label']=='见下' and root['key']=='E' and any(l.startswith('e |') and '见下' in l for l in zg.splitlines())
 modern=list(dict.fromkeys(py for f in ['kMandarin','kTGHZ2013'] for py in props[c].get(f,{}).get('readings',[])))
 assert r['entries']==[{'pinyin':py,'code':sounds[py]+r['first']['key']+r['last']['key']} for py in modern if sounds[py]]
 generated.update((c,e['code']) for e in r['entries'])
assert len(g['records'])==8 and len(generated)==11
assert next(r for r in g['records'] if r['char']=='无')['status']=='context-review-required'
assert next(r for r in g['records'] if r['char']=='生')['last']['glyph']=='龶' and '丰变形' in zg
# Only now inspect code comparison; generation and geometry were audited above.
ixpath=Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json');assert hashlib.sha256(ixpath.read_bytes()).hexdigest()==ixpath.stem;ix=json.loads(ixpath.read_text())
ref={(c,x.rstrip('-+*').upper()) for c,v in ix.items() for x in v['1'].split() if re.fullmatch('[a-zA-Z]{4}[-+*]*',x)}
tree=ast.parse((ROOT/'tools/shape-expansion/generate.py').read_text());canonical=[ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CANONICAL' for t in n.targets)][0]
assert canonical=={'a':'一','l':'丨','p':'丿','d':'丶','v':'乛','n':'ㄟ'}
for r in g['records']:
 labels=[canonical[a['key'].lower()] if a['kind']=='stroke' else a['glyph'] or a['label'] for a in [r['first'],r['last']]]
 assert labels==ix[r['char']]['2'].split()
compared=generated&ref;held={x for x in generated if x[0]=='无'};admissible=compared-held
four=set(json.loads((OUT/'production-four-characters.json').read_text()));spell={c for c,k in json.loads((OUT/'equivalent-transfer-actual-exact-pairs.json').read_text())};baseline=four|spell;new={c for c,k in admissible}-baseline;union=baseline|{c for c,k in admissible}
hy=(ROOT/'HY.txt').read_text();hyset={c for c in json.loads((OUT/'independent-properties.json').read_text())};hanchars=[c for c in hy if c in hyset];assert len(hanchars)==1840
out={'status':'passed-finite-endpoint-research-only','frozenCandidatesSha256':sha,'candidateCharacters':len(g['records']),'candidatePairs':len(generated),'exactPairs':len(compared),'exactCharacters':len({c for c,k in compared}),'semanticEndpointRootAgreementUsingPreexistingSixStrokeClasses':True,'codeComparison':[{ 'char':c,'code':k,'exact':(c,k) in compared,'contextHeld':c=='无'} for c,k in sorted(generated)],'contextHeldCharacter':'无','admissibleEndpointPairs':len(admissible),'admissibleEndpointCharacters':len({c for c,k in admissible}),'newCharactersAfterBroadSpelling':sorted(new),'researchCombinedUnion':len(union),'hyCoveredOccurrences':sum(c in union for c in hanchars),'hyMissing':{c:hanchars.count(c) for c in dict.fromkeys(hanchars) if c not in union},'scope':'Checker inspected licensed SVG stroke geometry and every source/key/sound witness. Finite authored endpoints only; intervening strokes remain explicitly unexpanded. No generic recognizer or full-teaching certification.'}
(OUT/'common-finite-independent-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2))
