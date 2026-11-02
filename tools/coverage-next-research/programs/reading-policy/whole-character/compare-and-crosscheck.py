from pathlib import Path
import json,re,hashlib,itertools
R=Path('/mnt/d/document/research/alive_babble/xiaohe-learn');B=Path('/root/.cache/babble-coverage-next');P=B/'reading-policy/whole-character';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
g=json.loads((P/'generation-manifest.json').read_text());assert g['generatedWithoutReference'];assert sha(P/'candidates-before-reference.json')==g['candidatesSha256']
for x in g['inputs']:assert sha(x['path'])==x['sha256']and Path(x['path']).stat().st_size==x['bytes']
rows=json.loads((P/'candidates-before-reference.json').read_text());by={(r['char'],r['pinyin'],r['code']):r for r in rows};assert len(by)==len(rows)
# Independent second implementation uses the prior checker's fully audited
# six-property extraction and cached calls to the actual sound implementation.
props=json.loads((B/'checker/independent-properties.json').read_text());sounds=json.loads((B/'checker/sound-results.json').read_text());four=set(json.loads((B/'checker/production-four-characters.json').read_text()));expected={}
for line_no,line in enumerate((R/'tools/libre-flypy-audit/inputs/release-output-1.2.0.txt').read_text().splitlines(),1):
 c,code=line.split('\t')
 if not re.fullmatch('[a-z]{4}',code)or c in four:continue
 for field,record in props.get(c,{}).items():
  for pinyin in record['readings']:
   assert pinyin in sounds,pinyin
   sound=sounds[pinyin]
   if sound and code.upper().startswith(sound):
    key=(c,pinyin,code.upper());e=expected.setdefault(key,{'line':line_no,'evidence':[]});ev={'field':field,'sourceLine':record['sourceLine'],'rawValue':record['rawValue']};
    if ev not in e['evidence']:e['evidence'].append(ev)
assert set(expected)==set(by)
for key,e in expected.items():
 actual=by[key];assert actual['publishedLine']==e['line'];assert sorted(actual['readingEvidence'],key=lambda r:r['field'])==sorted(e['evidence'],key=lambda r:r['field'])
# Comparator opened only after complete cross-implementation candidate checking.
ref_path=Path('/root/.cache/babble-completion/official-ix/252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17.json');assert sha(ref_path)=='252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17';ref=json.loads(ref_path.read_text());accepted=[]
for row in rows:
 codes={re.sub('[-+*]+$','',v).upper()for v in ref.get(row['char'],{}).get('1','').split()if re.fullmatch('[a-zA-Z]{4}[-+*]*',v)}
 if row['code']in codes:accepted.append(row)
chars={r['char']for r in accepted};finite=set('升断见生继夜');effects={}
reps=json.loads(Path('/root/.cache/babble-coverage-research/benchmarks/repertoires.json').read_text())['properties'];hy=(R/'the_Tower_of_Babel.txt').read_text();modern=json.loads((R/'src/data/generated/readings.json').read_text())['characters'];han=[c for c in hy if c in modern]
for mode in ['full','no-cjkvi']:
 exact=json.loads((B/f'checker/leaf-{mode}-actual-exact-pairs.json').read_text());before=four|{r[0]for r in exact}|finite;after=before|chars
 effects[mode]={'before':len(before),'after':len(after),'netAdded':len(after-before),'newCharacters':sorted(after-before),'normative':{k:{'before':sum(r['char']in before for r in rs),'after':sum(r['char']in after for r in rs),'total':len(rs)}for k,rs in reps.items()},'hyBefore':sum(c in before for c in han),'hyAfter':sum(c in after for c in han)}
result={'scope':'Source-labelled WHOLE-character dictionary-reading options. Prefix/source/code comparison checked; no decision that old/rare/region readings are suitable modern learning defaults. Product unchanged.','candidateCharacters':len({r['char']for r in rows}),'candidateReadingCodeOptions':len(rows),'crossImplementationCompleteEquality':True,'acceptedCharacters':len(chars),'acceptedReadingCodeOptions':len(accepted),'accepted':accepted,'effects':effects,'candidateSha256':g['candidatesSha256']}
(P/'comparison-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items()if k not in ['accepted','effects']},ensure_ascii=False,indent=2));print(json.dumps(effects,ensure_ascii=False,indent=2))
