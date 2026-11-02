#!/usr/bin/env python3
"""MIT wrapper; extracted Unicode data retains Unicode-3.0. No comparator access."""
import hashlib,json,re,sys,unicodedata,zipfile
from pathlib import Path
archive=Path('/root/.cache/babble-coverage-research/benchmarks/Unihan-17.0.0.zip')
expected='f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected
selected=('kMandarin','kTGHZ2013','kHanyuPinyin','kXHC1983','kHanyuPinlu','kSMSZD2003Readings')
properties={};counts={p:0 for p in selected}
with zipfile.ZipFile(archive) as z:
 payload=z.read('Unihan_Readings.txt')
 for line_num,line in enumerate(payload.decode().splitlines(),1):
  if not line or line.startswith('#'):continue
  cp,p,raw=line.split('\t')
  if p not in selected:continue
  c=chr(int(cp[2:],16));readings=[]
  for token in raw.split():
   if p=='kMandarin': values=[token]
   elif p in ('kTGHZ2013','kHanyuPinyin','kXHC1983'):
    loc,sep,value=token.partition(':');assert sep and loc and value,(p,token)
    syntax={'kTGHZ2013':r'(?:\d{3}\.\d{3},)*\d{3}\.\d{3}', 'kHanyuPinyin':r'(?:\d{5}\.\d{2}0,)*\d{5}\.\d{2}0','kXHC1983':r'\d{4}\.\d{3}\*?(?:,\d{4}\.\d{3}\*?)*'}[p]
    assert re.fullmatch(syntax,loc),(p,token)
    values=value.split(',')
   elif p=='kHanyuPinlu':
    m=re.fullmatch(r'([^()]+)\((\d+)\)',token);assert m,(p,token);values=[m[1]]
   else:
    mandarin,sep,cantonese=token.partition('粵');assert sep and mandarin and cantonese,(p,token)
    assert re.fullmatch(r'[a-z]+[1-6](?:[a-z]+[1-6])?(?:,[a-z]+[1-6](?:[a-z]+[1-6])?)*',cantonese),(p,token)
    values=mandarin.split(',')
   for reading in values:
    reading=unicodedata.normalize('NFC',reading);assert reading
    if reading not in readings:readings.append(reading)
  assert p not in properties.setdefault(c,{})
  properties[c][p]={'readings':readings,'rawValue':raw,'sourceLine':line_num}
  counts[p]+=1
output={'archive':{'path':str(archive),'sha256':expected,'url':'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip'},'member':{'name':'Unihan_Readings.txt','sha256':hashlib.sha256(payload).hexdigest()},'propertyRecordCounts':counts,'characters':properties}
out=Path(sys.argv[1]);out.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'path':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'propertyRecordCounts':counts}))
