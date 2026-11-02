// MIT wrapper. Measure frozen candidate policies as hypothetical overlays; no product mutation.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const ROOT='/mnt/d/document/research/alive_babble/xiaohe-learn',HERE='/root/.cache/babble-coverage-next/reading-policy'
const hash=b=>createHash('sha256').update(b).digest('hex'),inputs=[]
async function read(path,pin){const bytes=await readFile(path);if(pin)assert.equal(hash(bytes),pin.sha256??pin,path);inputs.push({path,bytes:bytes.length,sha256:hash(bytes)});return bytes}
const manifest=JSON.parse(await read(join(HERE,'generation-manifest.json')))
const summary=JSON.parse(await read(join(HERE,'summary.json')))
assert.equal(summary.generationManifestSha256,hash(await readFile(join(HERE,'generation-manifest.json'))))
const repertoirePath='/root/.cache/babble-coverage-research/benchmarks/repertoires.json'
const repertoires=JSON.parse(await read(repertoirePath));assert.equal(repertoires.sha256,manifest.unihan.sha256)
const targetData=JSON.parse(await read(join(ROOT,'data/unicode-targets.json')))
const {createServer}=await import(join(ROOT,'node_modules/vite/dist/node/index.js'))
const server=await createServer({root:ROOT,configFile:false,logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null}})
try{
 const [{TRAINING_ENTRIES},{isHanCharacter}]=await Promise.all([server.ssrLoadModule('/src/data/library.ts'),server.ssrLoadModule('/src/domain/han.ts')])
 const four=new Set(TRAINING_ENTRIES.map(e=>e.char));assert.equal(four.size,8302,'Original four-code baseline changed')
 const initialFour=[...four].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0)),fourBytes=Buffer.from(JSON.stringify(initialFour)+'\n')
 await writeFile(join(HERE,'original-four-characters.json'),fourBytes)
 // Pin all local SSR dependencies actually loaded for the original runtime baseline.
 const graph=server.moduleGraph.idToModuleMap
 for(const raw of [...graph.keys()].sort()){let path=raw.split('?')[0];if(path.startsWith(ROOT+'/')&&!path.includes('/node_modules/'))await read(path)}
 const textPath=join(ROOT,'the_Tower_of_Babel.txt'),text=(await read(textPath)).toString(),han=Array.from(text).filter(isHanCharacter),occurrences=new Map()
 for(const c of han)occurrences.set(c,(occurrences.get(c)??0)+1)
 const targets={}
 for(const version of targetData.versions){const set=new Set();for(const [a,b]of version.ranges)for(let cp=parseInt(a,16);cp<=parseInt(b,16);cp++)set.add(String.fromCodePoint(cp));assert.equal(set.size,version.count);targets[`Unicode-${version.version}-Unified_Ideograph`]=set}
 const tgh=repertoires.properties.kTGH.map(x=>({char:x.char,index:Number(x.value.split(':')[1])}))
 targets['TGH-2013-level1']=new Set(tgh.filter(x=>x.index<=3500).map(x=>x.char))
 targets['TGH-2013-level2']=new Set(tgh.filter(x=>x.index>3500&&x.index<=6500).map(x=>x.char))
 targets['TGH-2013-level3']=new Set(tgh.filter(x=>x.index>6500).map(x=>x.char))
 targets['TGH-2013-all']=new Set(tgh.map(x=>x.char))
 for(const prop of ['kGB0','kBigFive'])targets[prop]=new Set(repertoires.properties[prop].map(x=>x.char))
 function metrics(chars){return {characters:chars.size,targets:Object.fromEntries(Object.entries(targets).map(([name,set])=>{const covered=[...set].filter(c=>chars.has(c));return[name,{target:set.size,covered:covered.length,missing:set.size-covered.length}]})),text:{hanOccurrences:han.length,uniqueHan:occurrences.size,coveredOccurrences:han.filter(c=>chars.has(c)).length,coveredUnique:[...occurrences.keys()].filter(c=>chars.has(c)).length,missing:[...occurrences].filter(([c])=>!chars.has(c)).map(([char,occurrences])=>({char,occurrences}))}}}
 const exactSets={},candidateSets={}
 for(const policy of manifest.policies){const pin=manifest.generated.find(x=>x.file===policy.id+'.candidates.json');const data=JSON.parse(await read(join(HERE,pin.file),pin)),comparison=JSON.parse(await read(join(HERE,policy.id+'.comparison.json')));assert.equal(data.rows.length,comparison.allCandidateExactFlags.length);const set=new Set(data.rows.filter((_,i)=>comparison.allCandidateExactFlags[i]===1).map(r=>r[0]));assert.equal(set.size,summary.policies[policy.id].confirmedCharacters);exactSets[policy.id]=set;candidateSets[policy.id]=new Set(data.rows.map(r=>r[0]))}
 const base=new Set([...four,...exactSets.baseline]);assert.equal(base.size,60891)
 const policies={}
 for(const policy of manifest.policies){const chars=exactSets[policy.id],available=new Set([...four,...chars]),increment=[...available].filter(c=>!base.has(c));policies[policy.id]={spelling:metrics(chars),availableWithOriginalFour:metrics(available),incrementalAvailableCharacters:increment.length,incrementalCharactersAlreadyAvailableWithFour:[...chars].filter(c=>!exactSets.baseline.has(c)&&four.has(c)).length,incrementalAvailableList:increment.sort((a,b)=>a.codePointAt(0)-b.codePointAt(0)),candidateCharacters:candidateSets[policy.id].size}}
 const result={schemaVersion:1,purpose:'Hypothetical reading-policy overlay on original8302 four-code characters. Does not change production counts or infer all readings/font/teaching coverage.',generator:{path:fileURLToPath(import.meta.url),sha256:hash(await readFile(fileURLToPath(import.meta.url)))},originalFour:{characters:four.size,readingOptions:TRAINING_ENTRIES.length,export:{file:'original-four-characters.json',bytes:fourBytes.length,sha256:hash(fourBytes)},metrics:metrics(four)},baseline:metrics(base),policies,inputs}
 await writeFile(join(HERE,'coverage-effects.json'),JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify({originalFour:four.size,baseline:result.baseline,policies:Object.fromEntries(Object.entries(policies).map(([id,x])=>[id,{union:x.availableWithOriginalFour.characters,new:x.incrementalAvailableCharacters,alreadyFour:x.incrementalCharactersAlreadyAvailableWithFour,tgh:x.availableWithOriginalFour.targets['TGH-2013-all'],hy:x.availableWithOriginalFour.text}]))},null,2))
}finally{await server.close()}
