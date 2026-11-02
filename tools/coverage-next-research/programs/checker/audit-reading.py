from pathlib import Path
import json,ast,hashlib,itertools,collections,re
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');HERE=Path('/root/.cache/babble-coverage-next/reading-policy');OUT=Path('/root/.cache/babble-coverage-next/checker')
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest=json.loads((HERE/'generation-manifest.json').read_text());summary=json.loads((HERE/'summary.json').read_text())
assert sha((HERE/'run.mjs').read_bytes())==manifest['generator']['sha256']==summary['generator']['sha256']
assert sha((HERE/'generation-manifest.json').read_bytes())==summary['generationManifestSha256']
assert manifest['comparisonOpened'] is False
for pin in manifest['sourceFiles']+manifest['inputs']:
 b=Path(pin['path']).read_bytes();assert sha(b)==pin['sha256'] and len(b)==pin['bytes'],pin['path']
for pin in manifest['generated']:
 b=(HERE/pin['file']).read_bytes();assert sha(b)==pin['sha256'] and len(b)==pin['bytes'],pin['file']
props=json.loads((OUT/'independent-properties.json').read_text());sounds=json.loads((OUT/'sound-results.json').read_text())
tree=ast.parse((ROOT/'tools/component-spelling/inputs/gen_dict.py').read_text())
aliases=[ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='custom_dict' for x in n.targets)][0]
config=json.loads((ROOT/'tools/component-spelling/config.json').read_text());special=config['globalComponentRules']
rows={}
for no,line in enumerate((ROOT/'tools/component-spelling/inputs/radical.yaml').read_text().splitlines(),1):
 if not line or line.startswith('#'):continue
 char,parts=line.split('\t');rows[no]=(char,parts.split())
results={};pairs_by_policy={}
for policy in manifest['policies']:
 pid=policy['id'];g=json.loads((HERE/(pid+'.candidates.json')).read_text());assert g['policy']==policy
 available={};expected=set();maxcomb=0;rejected=collections.Counter();dist=collections.Counter();eligible=multiple=0
 def choices(part):
  if part in available:return available[part]
  if part in special:values=[special[part]['code']]
  else:
   pinyins=list(aliases.get(part,[[]])[0])
   if policy['alias']=='union' or part not in aliases:
    pinyins += [py for field in policy['fields'] for py in props.get(part,{}).get(field,{}).get('readings',[])]
   values=list(dict.fromkeys(sounds[py] for py in pinyins if sounds[py]))
  available[part]=values;return values
 for char,parts in rows.values():
  if len(parts) not in config['componentCounts'] or any(len(p)!=1 or 0xd800<=ord(p)<=0xdfff for p in parts):rejected['length']+=1;continue
  opts=[choices(p) for p in parts]
  if any(not x for x in opts):rejected['missingReading']+=1;continue
  eligible+=1;n=1
  for o in opts:n*=len(o)
  maxcomb=max(maxcomb,n);dist[n]+=1;multiple+=n>1
  if n>config['maximumCombinationsPerSourceRow']:rejected['combinationLimit']+=1;continue
  expected.update((char,'OK'+''.join(combo)) for combo in itertools.product(*opts))
 actual=set()
 for char,code,ids,no in g['rows']:
  assert (char,code) not in actual;actual.add((char,code))
  source_char,parts=rows[no];components=[g['components'][i] for i in ids]
  assert char==source_char and parts==[c['part'] for c in components]
  assert code=='OK'+''.join(c['code'] for c in components)
 for c in g['components']:
  assert c['code'] in choices(c['part']) and c['evidence']
  for e in c['evidence']:
   assert sounds[e['pinyin']]==c['code']
   if e['source']=='flypy:component-spelling-rule':assert special[c['part']]=={'pinyin':e['pinyin'],'code':e['code']} and e['evidenceUrl']==config['globalRuleEvidence']['url']
   elif e['source']=='radical:component-mnemonic':assert e['pinyin'] in aliases[c['part']][0]
   else:
    f=e['source'].split(':',1)[1];r=props[c['part']][f]
    assert f in policy['fields'] and e['pinyin'] in r['readings'] and e['sourceLine']==r['sourceLine'] and e['rawValue']==r['rawValue']
 assert expected==actual,pid
 s=manifest['statistics'][pid]
 assert len(actual)==s['candidatePairs'] and len({c for c,k in actual})==s['candidateCharacters']
 assert maxcomb==s['maximumCombinations'] and eligible==s['eligibleSourceRows'] and multiple==s['multipleChoiceRows']
 assert all(rejected[k]==v for k,v in s['rejected'].items()) and {str(k):v for k,v in dist.items()}==s['choiceDistribution']
 pairs_by_policy[pid]=actual
 results[pid]={'candidateCharacters':len({c for c,k in actual}),'candidatePairs':len(actual),'maximumCombinations':maxcomb,'rejected':dict(rejected),'completeIndependentGenerationEqual':True,'allProvenanceVerified':True}
 print(pid,'generation verified',len(actual),flush=True)
# Candidate sets and all provenance are fully checked before reading comparison-only records.
refpath=Path('/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml');b=refpath.read_bytes();assert sha(b)==manifest['comparisonOnly']['sha256']
ref=set();started=False
for line in b.decode().splitlines():
 if line=='...':started=True;continue
 if not started or not line or line.startswith('#'):continue
 cols=line.split('\t');assert len(cols[0])==1 and re.fullmatch('ok[a-z]{4}(?:[a-z]{2})?',cols[1]);ref.add((cols[0],cols[1].upper()))
refchars={c for c,k in ref};base=pairs_by_policy['baseline']&ref;basechars={c for c,k in base};four=set(json.loads((OUT/'production-four-characters.json').read_text()))
ixpath=Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json');assert sha(ixpath.read_bytes())==ixpath.stem
ix=json.loads(ixpath.read_text());ref4={c for c,v in ix.items() if any(re.fullmatch('[a-zA-Z]{4}[-+*]*',x) for x in v['1'].split())};known=ref4|refchars
for pid,pairs in pairs_by_policy.items():
 matched=pairs&ref;chars={c for c,k in matched};g=json.loads((HERE/(pid+'.candidates.json')).read_text());cmp=json.loads((HERE/(pid+'.comparison.json')).read_text())
 flags=[int((r[0],r[1]) in ref) for r in g['rows']];assert flags==cmp['allCandidateExactFlags']
 assert {tuple(r[:2]) for r in cmp['newExactCandidateRows']}==matched-base
 assert set(cmp['newlyMatchedCharacters'])==chars-basechars
 r=results[pid];r.update({'exactCharacters':len(chars),'exactPairs':len(matched),'newExactCharacters':len(chars-basechars),'newExactPairs':len(matched-base),'fourAndExactCharacters':len(four|chars),'newAnyMethodCharacters':len((four|chars)-(four|basechars)),'missingKnownOfficial':len(known-(four|chars))})
 s=summary['policies'][pid]
 for own,other in [('exactCharacters','confirmedCharacters'),('exactPairs','confirmedPairs'),('newExactCharacters','incrementalConfirmedCharacters'),('newExactPairs','incrementalConfirmedPairs')]:assert r[own]==s[other]
out={'status':'passed','referenceCharacters':len(refchars),'referencePairs':len(ref),'officialFourCharacters':len(ref4),'knownOfficialUnion':len(known),'currentFourCharacters':len(four),'currentUnion':len(four|basechars),'policies':results}
(OUT/'reading-independent-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k!='policies'}))
