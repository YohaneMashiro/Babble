#!/usr/bin/env python3
"""Documented CJKVI uppercase [region] metadata suffixes: all variants retained.
No comparator access. Same cuts, exact named subtree relation, and fixed limits.
"""
from pathlib import Path
import json,hashlib,re
B=Path('/root/.cache/babble-coverage-next/decomposition');OUT=B/'tagged-cjkvi';OUT.mkdir(exist_ok=True)
ns={};exec(compile((B/'generate.py').read_text().split("\nsummary={'generatedWithoutComparator'")[0],str(B/'generate.py'),'exec'),ns)
original=ns['parse']
def parse_tagged(expr):return original(re.sub(r'(?:\[[A-Z]+\])+$','',expr))
ns['parse']=parse_tagged
paths=[ns['S']/'cjkvi--cjkvi-ids/ids.txt',ns['S']/'cjkvi--cjkvi-ids/ids-ext-cdef.txt']
fullp=Path('/root/.cache/babble-coverage-next/reading-policy/union-all-component-choices.json')
assert hashlib.sha256(fullp.read_bytes()).hexdigest()=='58ec05711e509c2f1146a42ac2fd6589503ec82f67aae4e6cddb8e966b09592a'
summary={'generatedWithoutComparator':True,'normalization':'Strip only trailing [A-Z]+ region/source-shape metadata tags documented in pinned CJKVI README; retain all variants. Existing parenthetical metadata support and no other parser changes.','generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'originalGeneratorSha256':hashlib.sha256((B/'generate.py').read_bytes()).hexdigest(),'policies':[],'sources':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]}
fixed=json.loads((B/'sound-choices.json').read_text());full=json.loads(fullp.read_text())
for policy,choices in [('fixed-reading',fixed),('union-all-reading',full)]:
 ns.update(OUT=OUT,CHOICES=choices,READABLE=set(choices))
 rows,keys,stats=ns['generate_ids']('cjkvi-tagged',paths,'chise',True)
 summary['policies'].append(ns['encode'](policy,rows,keys,stats))
# Independent structure-only membership corpus with the same documented parser.
rows,keys,stats=ns['load_ids'](paths,'chise');parts=set(keys)
for row in rows:parts.update(c for c in ns['stringify'](row['tree']) if c not in ns['ARITY'])
ns['READABLE']=parts
rows,keys,stats=ns['generate_ids']('cjkvi-tagged-structural',paths,'chise',True)
payload=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows)
(OUT/'structural-rows.jsonl').write_text(payload)
summary['structural']={'rows':len(rows),'sha256':hashlib.sha256(payload.encode()).hexdigest(),'sourceKeys':''.join(sorted(keys,key=ord)),'stats':stats}
(OUT/'generation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
