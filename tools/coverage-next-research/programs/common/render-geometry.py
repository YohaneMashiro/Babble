from pathlib import Path
import json,html,hashlib
base=Path('/root/.cache/babble-coverage-next/common');src=base/'sources'
choices={
 '无':([0],[1,2,3]),'生':([0],[1,2,3,4]),'大':([0,1],[2]),'见':([0,1],[2,3]),
 '升':([0],[1,2,3]),'断':(list(range(6)),[7,8,9,10]),'继':([0,1,2],[9]),'夜':([0,1],[7]),
}
chars=list(choices)+list('牛人一儿廾尢');cards=[]
for c in chars:
 data=json.loads((src/f'writer-{c}.json').read_text());first,last=choices.get(c,([],[]));parts=[];labels=[]
 for i,(path,median)in enumerate(zip(data['strokes'],data['medians'])):
  color='#1769bb'if i in first else'#c53630'if i in last else'#767b84'
  parts.append(f'<path d="{html.escape(path,quote=True)}" fill="{color}" fill-opacity=".78"/>')
  x,y=median[len(median)//2]
  labels.append(f'<text x="{x}" y="{900-y}" fill="#111" stroke="white" stroke-width="10" paint-order="stroke" font-size="62">{i+1}</text>')
 svg='<svg viewBox="0 0 1024 1024"><g transform="translate(0 900) scale(1 -1)">'+''.join(parts)+'</g>'+''.join(labels)+'</svg>'
 cards.append(f'<article><h2>{c} <small>{len(parts)} strokes</small></h2>{svg}<p>Blue first; red last; gray unexpanded.</p></article>')
page='<html><meta charset="utf-8"><style>body{font:16px sans-serif;background:#fff;margin:20px}main{display:grid;grid-template-columns:repeat(4,250px);gap:16px}article{border:1px solid #ccc;padding:8px}h2{margin:0}small{font:14px sans-serif}svg{width:230px;height:230px}p{font-size:11px}</style><h1>Licensed source geometry — authored endpoint candidates, not code answers</h1><p>Source glyphs: Arphic Technology © 1999 / Hanzi Writer Data 68d10a4b. Colors and stroke indices added by Babble, 2026-10-30. Arphic Public License; see adjacent ARPHICPL.TXT.</p><main>'+''.join(cards)+'</main></html>'
(base/'geometry-sheet.html').write_text(page)
(base/'endpoint-selection-preregistered.json').write_text(json.dumps({'purpose':'Author-selected stroke scopes derived from fixed writer glyphs and public general root rules; no comparator read by this rendering program; endpoints do not claim full-root-sequence review','choices':{c:{'first':v[0],'last':v[1],'unexpanded':[i for i in range(len(json.loads((src/f'writer-{c}.json').read_text())['strokes']))if i not in v[0]+v[1]]}for c,v in choices.items()}},ensure_ascii=False,indent=2)+'\n')
print('Sheet ready; selection SHA',hashlib.sha256((base/'endpoint-selection-preregistered.json').read_bytes()).hexdigest())
