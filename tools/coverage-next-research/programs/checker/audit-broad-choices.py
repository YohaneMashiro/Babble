from pathlib import Path
import json,hashlib,ast
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');OUT=Path('/root/.cache/babble-coverage-next/checker')
p=Path('/root/.cache/babble-coverage-next/reading-policy/union-all-component-choices.json');b=p.read_bytes();assert hashlib.sha256(b).hexdigest()=='58ec05711e509c2f1146a42ac2fd6589503ec82f67aae4e6cddb8e966b09592a'
actual=json.loads(b);props=json.loads((OUT/'independent-properties.json').read_text());sounds=json.loads((OUT/'sound-results.json').read_text());config=json.loads((ROOT/'tools/component-spelling/config.json').read_text())
tree=ast.parse((ROOT/'tools/component-spelling/inputs/gen_dict.py').read_text());aliases=[ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='custom_dict' for x in n.targets)][0]
expected={};fields=['kMandarin','kTGHZ2013','kHanyuPinyin','kXHC1983','kHanyuPinlu','kSMSZD2003Readings']
for part in set(props)|set(aliases)|set(config['globalComponentRules']):
 bycode={}
 def add(py,source,extra):
  code=sounds[py]
  if not code:return
  e={'pinyin':py,'source':source,**extra}
  if code not in bycode:bycode[code]={'part':part,'pinyin':py,'code':code,'sourceId':source,'evidence':[]}
  if e not in bycode[code]['evidence']:bycode[code]['evidence'].append(e)
 if part in config['globalComponentRules']:
  special=config['globalComponentRules'][part];add(special['pinyin'],'flypy:component-spelling-rule',{'code':special['code'],'evidenceUrl':config['globalRuleEvidence']['url']})
 else:
  for py in aliases.get(part,[[]])[0]:add(py,'radical:component-mnemonic',{})
  for f in fields:
   if f not in props.get(part,{}):continue
   r=props[part][f]
   for py in r['readings']:add(py,'unihan17:'+f,{'sourceLine':r['sourceLine'],'rawValue':r['rawValue']})
 if bycode:expected[part]=list(bycode.values())
assert actual==expected
out={'status':'passed','sha256':hashlib.sha256(b).hexdigest(),'parts':len(actual),'choices':sum(map(len,actual.values())),'allChoicesAndEvidenceIndependentlyRegeneratedEqual':True}
(OUT/'broad-component-choices-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
