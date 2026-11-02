#!/usr/bin/env python3
"""Independently generate decompositions. This program never reads a comparator.

Tree cuts retain operator topology. A compound node can become a named component
only when the exact standard-IDS expression is explicitly a definition of that
character in the same source corpus. No approximate shapes, inferred readings,
raw flattening or per-target policies are used. Flat grouping is separate:
contiguous multi-part chunks require an explicit licensed row with that exact
ordered component sequence. All candidate choices are retained before comparison.
"""
from pathlib import Path
from collections import defaultdict,Counter
import re,json,itertools,hashlib,time
ROOT=Path('/mnt/d/document/research/alive_babble/xiaohe-learn')
OUT=Path('/root/.cache/babble-coverage-next/decomposition')
S=OUT/'sources'
CHOICES=json.loads((OUT/'sound-choices.json').read_text())
READABLE=set(CHOICES)
ARITY={chr(i):2 for i in range(0x2ff0,0x2ffe)}
ARITY.update({'⿲':3,'⿳':3,'⿾':1,'⿿':1,'㇯':2})
MAX_CUTS=4096
MAX_COMBOS=256

def scalar(c):return len(c)==1 and not 0xd800<=ord(c)<=0xdfff

def parse(expr):
    # Only standard IDS. Parenthetical source variant tags have no tree nodes.
    expr=re.sub(r'(?:\([^()]*\))+$','',expr)
    def node(i):
        if i>=len(expr):raise ValueError('short')
        c=expr[i]
        if c in ARITY:
            children=[];j=i+1
            for _ in range(ARITY[c]):
                child,j=node(j);children.append(child)
            return (c,tuple(children)),j
        if not scalar(c) or c.isspace() or c.isascii() or c in '#{}[]？①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳':raise ValueError('nonstandard')
        return c,i+1
    t,end=node(0)
    if end!=len(expr):raise ValueError('trailing')
    return t

def stringify(t):return t if isinstance(t,str) else t[0]+''.join(map(stringify,t[1]))

def load_ids(paths,kind):
    rows=[];stats=Counter();keys=set()
    for p in paths:
        for lineno,line in enumerate(p.read_text().splitlines(),1):
            if not line or line.startswith(('#',';')):continue
            fields=line.split('\t')
            if kind=='yi':
                if len(fields)<2 or not scalar(fields[0]):continue
                c=fields[0];expressions=[(col,e) for col,field in enumerate(fields[1:],2) for e in field.split(';')]
            else:
                if len(fields)<3 or not scalar(fields[1]):continue
                c=fields[1];expressions=[(col,e) for col,e in enumerate(fields[2:],3)]
            keys.add(c)
            for col,e in expressions:
                stats['expressions']+=1
                try:t=parse(e)
                except ValueError as err:stats['parseRejected:'+str(err)]+=1;continue
                if isinstance(t,str):stats['atomicExpressions']+=1;continue
                stats['parsedCompoundExpressions']+=1
                rows.append({'char':c,'tree':t,'file':str(p),'line':lineno,'column':col,'expression':e})
    return rows,keys,stats

def cuts_for(t,inverse):
    # Options are ordered tuples plus one licensed equivalence locator per choice.
    opts={}
    if isinstance(t,str):
        if t in READABLE:opts[(t,)]=[]
        return opts
    for eq in inverse.get(t,[]):
        if eq['char'] in READABLE:opts.setdefault((eq['char'],),[{'char':eq['char'],'file':eq['file'],'line':eq['line'],'column':eq['column'],'expression':eq['expression']}])
    children=[cuts_for(x,inverse) for x in t[1]]
    if any(not x for x in children):return opts
    for choices in itertools.product(*(x.items() for x in children)):
        parts=tuple(itertools.chain.from_iterable(a[0] for a in choices))
        if len(parts)<=3:opts.setdefault(parts,list(itertools.chain.from_iterable(a[1] for a in choices)))
        if len(opts)>MAX_CUTS:raise OverflowError('tree cuts exceed uniform limit')
    return opts

def generate_ids(name,paths,kind,use_inverse):
    rows,keys,stats=load_ids(paths,kind)
    inverse=defaultdict(list)
    if use_inverse:
        for row in rows:inverse[row['tree']].append(row)
    records={}
    for row in rows:
        try:opts=cuts_for(row['tree'],inverse)
        except OverflowError:stats['rejectedTreeBound']+=1;continue
        for parts,equivalences in opts.items():
            if len(parts) not in [2,3] or row['char'] in parts:continue
            k=(row['char'],parts)
            records.setdefault(k,{'char':row['char'],'parts':list(parts),'witness':{key:row[key] for key in ['file','line','column','expression']},'equivalences':equivalences})
    return list(records.values()),keys,dict(stats)

def load_flat(paths):
    rows=[];keys=set()
    for path,kind in paths:
        for line_no,line in enumerate(path.read_text().splitlines(),1):
            if not line or line.startswith('#'):continue
            fields=line.split('\t')
            if len(fields)<2 or not scalar(fields[0]):continue
            c=fields[0];keys.add(c)
            for col,field in enumerate(fields[1:],2):
                parts=tuple(field.split())
                if parts and all(scalar(x) for x in parts):rows.append({'char':c,'parts':parts,'file':str(path),'line':line_no,'column':col,'source':kind})
    return rows,keys

def direct_flat(rows):
    records={}
    for row in rows:
        if len(row['parts']) not in [2,3] or any(p not in READABLE for p in row['parts']):continue
        records.setdefault((row['char'],row['parts']),{'char':row['char'],'parts':row['parts'],'witness':{k:row[k] for k in ['file','line','column','source']},'equivalences':[]})
    return list(records.values())

def grouped_flat(rows):
    inv=defaultdict(list);stats=Counter();records={}
    for row in rows:
        if row['char'] in READABLE and 2<=len(row['parts'])<=12:inv[row['parts']].append(row)
    for row in rows:
        n=len(row['parts'])
        if n<4:continue
        stats['sourceFourPlusRows']+=1
        if n>12:stats['rejectedSourceLengthBound']+=1;continue
        found={}
        for count in [2,3]:
            for boundaries in itertools.combinations(range(1,n),count-1):
                points=(0,)+boundaries+(n,);options=[]
                for i,j in zip(points,points[1:]):
                    chunk=row['parts'][i:j]
                    if len(chunk)==1:options.append([(chunk[0],None)] if chunk[0] in READABLE else [])
                    else:options.append([(x['char'],{k:x[k] for k in ['char','file','line','column','source']}) for x in inv.get(chunk,[])])
                if any(not x for x in options):continue
                for choice in itertools.product(*options):
                    parts=tuple(x[0] for x in choice)
                    if row['char'] in parts:continue
                    found.setdefault(parts,[x[1] for x in choice if x[1]])
                    if len(found)>MAX_CUTS:break
                if len(found)>MAX_CUTS:break
            if len(found)>MAX_CUTS:break
        if len(found)>MAX_CUTS:stats['rejectedTreeBound']+=1;continue
        for parts,equivalences in found.items():records.setdefault((row['char'],parts),{'char':row['char'],'parts':parts,'witness':{k:row[k] for k in ['file','line','column','source']},'equivalences':equivalences})
    return list(records.values()),dict(stats)

def encode(name,rows,keys,stats):
    candidates={};source_characters=set();max_combo=0;rejected=0
    for row in rows:
        choices=[CHOICES[x] for x in row['parts']]
        combos=1
        for x in choices:combos*=len(x)
        max_combo=max(max_combo,combos)
        if combos>MAX_COMBOS:rejected+=1;continue
        for components in itertools.product(*choices):
            code='OK'+''.join(x['code'] for x in components)
            key=(row['char'],code)
            candidates.setdefault(key,{**row,'code':code,'components':components})
            source_characters.add(row['char'])
    payload=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in sorted(candidates.values(),key=lambda x:(ord(x['char']),x['code'])))
    path=OUT/(name+'-candidates.jsonl');path.write_text(payload)
    result={'policy':name,'sourceCharacters':len(keys),'candidateCharacters':len(source_characters),'candidatePairs':len(candidates),'distinctDecompositionRows':len(rows),'sourceStats':stats,'maximumSoundCombinations':max_combo,'rejectedSoundCombinationBound':rejected,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    print(json.dumps(result),flush=True)
    return result

summary={'generatedWithoutComparator':True,'limits':{'maxCutsPerTree':MAX_CUTS,'maxSoundCombinationsPerDecomposition':MAX_COMBOS,'flatSourceComponentsMax':12},'policies':[]}
old=ROOT/'tools/libre-flypy-audit/inputs/ids_lv2.txt'
new=S/'yi-bai--ids/ids_lv2.txt'
policies=[('yi-old-cuts',[old],'yi',False),('yi-old-exact-subtrees',[old],'yi',True),('yi-current-exact-subtrees',[new],'yi',True),('chise-current-exact-subtrees',sorted((S/'chise--ids').glob('IDS-UCS*.txt')),'chise',True),('cjkvi-exact-subtrees',[S/'cjkvi--cjkvi-ids/ids.txt',S/'cjkvi--cjkvi-ids/ids-ext-cdef.txt'],'chise',True)]
for name,paths,kind,inverse in policies:
 rows,keys,stats=generate_ids(name,paths,kind,inverse);summary['policies'].append(encode(name,rows,keys,stats))
flat_paths=[(ROOT/'tools/component-spelling/inputs/radical.yaml','radical'),(ROOT/'tools/shape-expansion/inputs/chaizi-jt.txt','chaizi-original-jt'),(ROOT/'tools/shape-expansion/inputs/chaizi-ft.txt','chaizi-original-ft'),(S/'henrysting--chaizi/chaizi-jt.txt','chaizi-henry-jt'),(S/'henrysting--chaizi/chaizi-ft.txt','chaizi-henry-ft')]
flat,keys=load_flat(flat_paths)
summary['policies'].append(encode('flat-explicit-alternatives',direct_flat(flat),keys,{}))
grouped,stats=grouped_flat(flat)
summary['policies'].append(encode('flat-fourplus-explicit-grouping',grouped,keys,stats))
summary['sourceKeys']={}
radical_keys=load_flat(flat_paths[:1])[1]
old_keys=load_ids([old],'yi')[1]
old_ch_keys=load_flat(flat_paths[1:3])[1]
old_union=radical_keys|old_keys|old_ch_keys
for name,paths,kind,_ in policies:
 keys=load_ids(paths,kind)[1]
 summary['sourceKeys'][name]={'keys':len(keys),'outsideOldYi':len(keys-old_keys),'outsideCurrentRadical':len(keys-radical_keys),'outsideCurrentRadicalOldYiChaiziUnion':len(keys-old_union),'outsideCurrentRadicalCharacters':''.join(sorted(keys-radical_keys,key=ord))}
(OUT/'generation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
