#!/usr/bin/env python3
"""Complete independent source/reading interaction corpus, no comparator reads.
Reuse the already-frozen decomposition functions; preserve their fixed policies.
Also generate reading-independent structural rows to classify later exclusions.
"""
from pathlib import Path
from collections import Counter
import json,hashlib,time
BASE=Path('/root/.cache/babble-coverage-next/decomposition')
OUT=BASE/'interaction'
OUT.mkdir(exist_ok=True)
source=(BASE/'generate.py').read_text()
assert source.count("\nsummary={'generatedWithoutComparator'")==1
ns={}
exec(compile(source.split("\nsummary={'generatedWithoutComparator'")[0],str(BASE/'generate.py'),'exec'),ns)
choices_path=Path('/root/.cache/babble-coverage-next/reading-policy/union-all-component-choices.json')
assert hashlib.sha256(choices_path.read_bytes()).hexdigest()=='58ec05711e509c2f1146a42ac2fd6589503ec82f67aae4e6cddb8e966b09592a'
choices=json.loads(choices_path.read_text())
ns.update(CHOICES=choices,READABLE=set(choices),OUT=OUT)
ROOT=ns['ROOT'];S=ns['S'];old=ROOT/'tools/libre-flypy-audit/inputs/ids_lv2.txt'
policies=[('yi-old-cuts',[old],'yi',False),('yi-old-exact-subtrees',[old],'yi',True),('yi-current-exact-subtrees',[S/'yi-bai--ids/ids_lv2.txt'],'yi',True),('chise-current-exact-subtrees',sorted((S/'chise--ids').glob('IDS-UCS*.txt')),'chise',True),('cjkvi-exact-subtrees',[S/'cjkvi--cjkvi-ids/ids.txt',S/'cjkvi--cjkvi-ids/ids-ext-cdef.txt'],'chise',True)]
flat_paths=[(ROOT/'tools/component-spelling/inputs/radical.yaml','radical'),(ROOT/'tools/shape-expansion/inputs/chaizi-jt.txt','chaizi-original-jt'),(ROOT/'tools/shape-expansion/inputs/chaizi-ft.txt','chaizi-original-ft'),(S/'henrysting--chaizi/chaizi-jt.txt','chaizi-henry-jt'),(S/'henrysting--chaizi/chaizi-ft.txt','chaizi-henry-ft')]
flat,flat_keys=ns['load_flat'](flat_paths)
summary={'generatedWithoutComparator':True,'limits':{'maxCutsPerTree':ns['MAX_CUTS'],'maxSoundCombinationsPerDecomposition':ns['MAX_COMBOS'],'flatSourceComponentsMax':12},'choices':{'path':str(choices_path),'sha256':hashlib.sha256(choices_path.read_bytes()).hexdigest(),'parts':len(choices)},'generator':{'path':str(Path(__file__)),'sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'reusedGeneratorSha256':hashlib.sha256((BASE/'generate.py').read_bytes()).hexdigest()},'policies':[],'sourceMembership':{}}
for name,paths,kind,inverse in policies:
 rows,keys,stats=ns['generate_ids'](name,paths,kind,inverse)
 summary['policies'].append(ns['encode'](name,rows,keys,stats));summary['sourceMembership'][name]=''.join(sorted(keys,key=ord))
summary['policies'].append(ns['encode']('flat-explicit-alternatives',ns['direct_flat'](flat),flat_keys,{}))
grouped,stats=ns['grouped_flat'](flat)
summary['policies'].append(ns['encode']('flat-fourplus-explicit-grouping',grouped,flat_keys,stats))
summary['sourceMembership']['flat']=''.join(sorted(flat_keys,key=ord))
# This diagnostic is generated independently from all source keys, not a missing-target list.
# Make every scalar leaf readable for topology enumeration, while retaining exact source equivalences.
all_parts=set(''.join(row['parts'] for row in []))
all_parts=set(flat_keys)|{p for row in flat for p in row['parts']}
all_rows=[];structural_keys=set();parsed_compound_keys=set();all_raw_keys=set(flat_keys)
for name,paths,kind,inverse in policies:
 rows,keys,stats=ns['load_ids'](paths,kind);all_raw_keys|=keys
 for row in rows:
  parsed_compound_keys.add(row['char'])
  all_parts.update(c for c in ns['stringify'](row['tree']) if c not in ns['ARITY'])
 all_parts|=keys
ns['READABLE']=all_parts
struct_summary=[]
for name,paths,kind,inverse in policies:
 rows,keys,stats=ns['generate_ids'](name,paths,kind,inverse)
 struct_summary.append({'policy':name,'rows':len(rows),'stats':stats})
 for row in rows:all_rows.append({'policy':name,**row});structural_keys.add(row['char'])
for name,rows in [('flat-explicit-alternatives',ns['direct_flat'](flat)),('flat-fourplus-explicit-grouping',ns['grouped_flat'](flat)[0])]:
 for row in rows:all_rows.append({'policy':name,**row});structural_keys.add(row['char'])
 structural_flat={r['char'] for r in rows}
struct_payload=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in all_rows)
(OUT/'structural-rows.jsonl').write_text(struct_payload)
summary['structuralDiagnostic']={'readingsUnrestricted':True,'allSourceKeys':''.join(sorted(all_raw_keys,key=ord)),'parsedCompoundKeys':''.join(sorted(parsed_compound_keys,key=ord)),'structuralKeys':''.join(sorted(structural_keys,key=ord)),'rows':len(all_rows),'sha256':hashlib.sha256(struct_payload.encode()).hexdigest(),'perIdsPolicy':struct_summary}
(OUT/'generation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'completed':True,'policies':len(summary['policies']),'structuralRows':len(all_rows)}),flush=True)
