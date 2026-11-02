// Babble original research program: MIT. Input geometry/data retain their notices.
import {readFile,writeFile} from 'node:fs/promises';import{createHash}from'node:crypto';import{createServer}from'/mnt/d/document/research/alive_babble/xiaohe-learn/node_modules/vite/dist/node/index.js';
const root='/mnt/d/document/research/alive_babble/xiaohe-learn',out='/root/.cache/babble-coverage-next/common',sha=b=>createHash('sha256').update(b).digest('hex');
const selection=JSON.parse(await readFile(out+'/endpoint-selection-preregistered.json','utf8'));
const strokes=await readFile(root+'/tools/libre-flypy-audit/src/roots.rs','utf8'),zg=await readFile('/root/.cache/babble-coverage-research/official/zg.md','utf8'),gz=await readFile('/root/.cache/babble-coverage-research/official/gz.md','utf8');
const roots={
 horizontal:{id:'stroke:horizontal',label:'横',glyph:'一',key:'A',kind:'stroke',scope:'single-selected-stroke'},
 you_without_dot:{id:'component:you-without-dot',label:'尤省点形（尢）',glyph:'尢',key:'Y',kind:'nested-component',scope:'common root identity; NOT the positional shortcut for analyzing 尢 itself',review:'needs-independent-context-review'},
 left_falling:{id:'stroke:left-falling',label:'撇',glyph:'丿',key:'P',kind:'stroke',scope:'single-selected-stroke'},
 sheng_lower:{id:'component:qing-top-gong',label:'龶（丰变形）',glyph:'龶',key:'F',kind:'component',scope:'selected four strokes; not identified by stroke-type prefix alone'},
 left_hand:{id:'component:zuo-top',label:'𠂇',glyph:'𠂇',key:'U',kind:'component',scope:'horizontal and left-falling block; endpoint contact is distinct from crossing'},
 right_falling:{id:'stroke:right-falling',label:'捺',glyph:'乀',key:'N',kind:'stroke',scope:'single-selected-stroke'},
 open_frame:{id:'component:open-bottom-frame',label:'冂',glyph:'冂',key:'K',kind:'component',scope:'open-bottom frame remains unclosed'},
 jian_lower:{id:'named-component:jian-lower',label:'见下',glyph:null,key:'E',kind:'named-component',scope:'two selected legs in 见; do not rename to canonical 儿'},
 gong:{id:'component:gong',label:'廾',glyph:'廾',key:'C',kind:'component',scope:'three selected source strokes'},
 rice:{id:'small-root:mi',label:'米',glyph:'米',key:'M',kind:'small-character',scope:'six selected source strokes'},
 jin:{id:'small-root:jin',label:'斤',glyph:'斤',key:'J',kind:'small-character',scope:'four selected source strokes'},
 silk:{id:'component:silk-left',label:'纟',glyph:'纟',key:'S',kind:'component',scope:'three selected source strokes'},
 turn:{id:'stroke:vertical-turn',label:'折',glyph:'𠃊',key:'V',kind:'stroke',scope:'one final stroke; not the enclosing IDS child order'},
 lid:{id:'component:wen-top',label:'亠',glyph:'亠',key:'W',kind:'component',scope:'two selected source strokes'},
};
const rootNames={无:['horizontal','you_without_dot'],生:['left_falling','sheng_lower'],大:['left_hand','right_falling'],见:['open_frame','jian_lower'],升:['left_falling','gong'],断:['rice','jin'],继:['silk','turn'],夜:['lid','right_falling']};
const explanations={
 无:'The licensed dictionary explicitly assigns stroke0 to 一 and strokes1..3 to 尢. Common root identity Y is kept separate from first/last code shortcuts U/V; the context still requires review.',
 生:'Use the displayed geometry, not a 3112 stroke-type match: the middle horizontal in 生 is shorter than its upper horizontal, unlike the long lower horizontal of canonical 牛. A separate leading 撇 plus the publicly named 龶 block preserves the actual shape. This is an authored finite endpoint analysis, not a general glyph recognizer.',
 大:'The initial horizontal and left-falling strokes form the existing 𠂇 component. The final right-falling stroke begins below the horizontal; it does not cross the selected component as a through-stroke. This differs from selecting 人 while ignoring the horizontal crossing its left-falling stroke.',
 见:'The first two strokes form the open-bottom frame 冂; the last two use the public named component 见下. The dictionary structural label 儿 does not redefine this named teaching root.',
 升:'Separate the initial left-falling stroke from the remaining three-stroke 廾 block. The source supplies ordered strokes; this is not inferred from IDS child order.',
 断:'The licensed per-stroke component paths assign strokes0..5 to 米 and7..10 to 斤. Stroke6 is explicitly left unexpanded between them; no full-root-sequence claim.',
 继:'The source ordered paths put 纟 at0..2, 米 at3..8 and the surrounding turn last at9. IDS enclosure child order alone would give the wrong final target; preserve the six middle strokes as unexpanded.',
 夜:'The top two strokes are 亠. The final right-falling stroke is separate from the source 夕 child path; intervening indices2..6 stay unexpanded. Do not accept a visually suggested 夂 block merely by dropping the inserted dot.',
};
const sourcePins=[];for(const p of [root+'/tools/libre-flypy-audit/src/roots.rs',root+'/src/data/generated/readings.json',root+'/src/data/generated/sound-mapping.json','/root/.cache/babble-coverage-research/official/zg.md','/root/.cache/babble-coverage-research/official/gz.md',out+'/selected-dictionary.json',out+'/endpoint-selection-preregistered.json',out+'/build-candidates.mjs']){const b=await readFile(p);sourcePins.push({path:p,bytes:b.length,sha256:sha(b)})}
for(const def of Object.values(roots)){
 if(def.glyph){const pattern=new RegExp("\\('"+def.glyph+"', '"+def.key.toLowerCase()+"'\\)");if(!pattern.test(strokes))throw new Error('No pinned root-key fact for '+def.id);def.rootSourceLines=strokes.split(/\r?\n/).flatMap((line,i)=>pattern.test(line)?[i+1]:[])}
 else if(!zg.split(/\r?\n/).some(line=>line.startsWith('e |')&&line.includes('见下')))throw new Error('Missing public named-root identity');
}
const server=await createServer({root,configFile:false,logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null}});
try{const{explainSound}=await server.ssrLoadModule('/src/domain/sound.ts');const readings=JSON.parse(await readFile(root+'/src/data/generated/readings.json','utf8')).characters,scheme=JSON.parse(await readFile(root+'/src/data/generated/sound-mapping.json','utf8'));
 const records=[];for(const[char,pair]of Object.entries(rootNames)){
  const p=out+'/sources/writer-'+char+'.json',b=await readFile(p),writer=JSON.parse(b);sourcePins.push({path:p,bytes:b.length,sha256:sha(b)});
  const scope=selection.choices[char],all=[...scope.first,...scope.last,...scope.unexpanded];if(new Set(all).size!==writer.strokes.length||all.some(i=>!Number.isInteger(i)||i<0||i>=writer.strokes.length))throw new Error('Bad stroke partition');
  const first=roots[pair[0]],last=roots[pair[1]],entries=[];for(const pinyin of readings[char]?.readings??[]){const sound=explainSound(pinyin,scheme);if(sound)entries.push({pinyin,code:sound.code+first.key+last.key})}
  records.push({char,first,last,strokeSelection:scope,sourceStrokeCount:writer.strokes.length,entries,explanation:explanations[char],scope:'finite-source-geometry-endpoints; middle remains unexpanded where listed; not complete teaching sequence',status:char==='无'?'context-review-required':'independent-geometry-review-candidate'});
 }
 const artifact={schemaVersion:1,researchOnly:true,method:'fixed licensed ordered geometry + public general root facts + authored stroke scopes + unchanged runtime sound mapping; comparator not opened by generation',caveat:'Some earlier code mismatches were already seen in previous research; this is not a blinded statistical accuracy experiment. Independent sources and public general rules, not reference code letters, justify each authored scope.',sourcePins,records};
 const b=Buffer.from(JSON.stringify(artifact,null,2)+'\n');await writeFile(out+'/finite-candidates-before-comparison.json',b);await writeFile(out+'/finite-candidates-before-comparison.sha256',sha(b)+'\n');console.log('Frozen finite candidates',records.length,'pairs',records.reduce((n,r)=>n+r.entries.length,0),'SHA',sha(b));
}finally{await server.close()}
