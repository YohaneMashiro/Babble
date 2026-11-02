// MIT wrapper. Unicode/GPL derived artifacts retain separate upstream terms.
// Generation is a separate mode; comparison verifies the complete prewritten corpus.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {parseAliases,parseRadical,parseReference,verifyPinned} from '/mnt/d/document/research/alive_babble/xiaohe-learn/tools/coverage-research/run.mjs'
import {generateCandidates as productionGenerate} from '/mnt/d/document/research/alive_babble/xiaohe-learn/tools/component-spelling/generate.mjs'
const ROOT='/mnt/d/document/research/alive_babble/xiaohe-learn'
const HERE='/root/.cache/babble-coverage-next/reading-policy'
const REF='/root/.cache/babble-coverage-research/community/kchen0x--rime-crane/xhup_dicts/xhup.ok.dict.yaml'
const sha=x=>createHash('sha256').update(x).digest('hex')
const extras=['kHanyuPinyin','kXHC1983','kHanyuPinlu','kSMSZD2003Readings']
const modern=['kMandarin','kTGHZ2013']
const policies=[
 {id:'baseline',alias:'override',fields:modern},
 {id:'union-modern',alias:'union',fields:modern},
 ...extras.flatMap(field=>['override','union'].map(alias=>({id:`${alias}-${field}`,alias,fields:[...modern,field]}))),
 {id:'override-all',alias:'override',fields:[...modern,...extras]},
 {id:'union-all',alias:'union',fields:[...modern,...extras]},
 ...extras.map(field=>({id:`union-all-except-${field}`,alias:'union',fields:[...modern,...extras.filter(p=>p!==field)]}))
]
const readJson=async path=>JSON.parse(await readFile(path,'utf8'))
const jsonBytes=value=>Buffer.from(JSON.stringify(value)+'\n')
async function writePinned(name,bytes){await writeFile(join(HERE,name),bytes);return {file:name,bytes:bytes.length,sha256:sha(bytes)}}
const own=async()=>({file:'run.mjs',sha256:sha(await readFile(fileURLToPath(import.meta.url)))})
const scalar=x=>Array.from(x).length===1&&!/[\uD800-\uDFFF]/u.test(x)
if(process.argv[2]==='--generate'){
 const lock=await readJson(join(ROOT,'tools/component-spelling/inputs.lock.json'))
 const config=await readJson(join(ROOT,'tools/component-spelling/config.json'))
 const inputs=[]
 async function pinned(relative,pin){const bytes=verifyPinned(await readFile(join(ROOT,relative)),pin,relative);inputs.push({path:join(ROOT,relative),bytes:bytes.length,sha256:sha(bytes)});return bytes}
 const rows=parseRadical((await pinned('tools/component-spelling/inputs/radical.yaml',lock.files['tools/component-spelling/inputs/radical.yaml'])).toString())
 const aliases=parseAliases((await pinned('tools/component-spelling/inputs/gen_dict.py',lock.files['tools/component-spelling/inputs/gen_dict.py'])).toString())
 const readings=JSON.parse(await pinned('src/data/generated/readings.json',lock.canonicalInputs['src/data/generated/readings.json'])).characters
 const scheme=JSON.parse(await pinned('src/data/generated/sound-mapping.json',lock.canonicalInputs['src/data/generated/sound-mapping.json']))
 const propBytes=verifyPinned(await readFile(join(HERE,'unihan17-properties.json')),'50a56ffb1db37770e6d50f102476fca892f3b3965ea71f3d9d4e2f16d58b8baf','extracted Unicode properties')
 const props=JSON.parse(propBytes)
 inputs.push({path:join(HERE,'unihan17-properties.json'),sha256:sha(propBytes),bytes:propBytes.length})
 const {createServer}=await import(join(ROOT,'node_modules/vite/dist/node/index.js'))
 const server=await createServer({root:ROOT,configFile:false,logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null}})
 try{
  const {explainSound}=await server.ssrLoadModule('/src/domain/sound.ts')
  // Verify modern properties independently reproduce the shipped reading order.
  for(const [char,item]of Object.entries(readings)){
   const values=[...new Set(modern.flatMap(p=>props.characters[char]?.[p]?.readings??[]))]
   assert.deepEqual(values,item.readings,`modern parser mismatch: ${char}`)
  }
  const sourceFiles=[]
  for(const path of ['tools/component-spelling/generate.mjs','tools/component-spelling/config.json','tools/component-spelling/inputs.lock.json','tools/coverage-research/run.mjs','tools/coverage-research/inputs.lock.json','src/domain/sound.ts','src/domain/dictionary.ts','src/domain/encoding.ts']){const bytes=await readFile(join(ROOT,path));sourceFiles.push({path:join(ROOT,path),bytes:bytes.length,sha256:sha(bytes)})}
  const pins=[],stats={},componentCatalog=[]
  for(const policy of policies){
   const cache=new Map(),components=[],ids=new Map(),rejected={length:0,missingReading:0,combinationLimit:0},candidateRows=[],seen=new Set(),choiceDistribution={},missing=new Map(),ambiguousRows=[],capRows=[]
   let maximumCombinations=0,eligibleSourceRows=0,multipleChoiceRows=0
   function choicesFor(part){
    if(cache.has(part))return cache.get(part)
    const byCode=new Map()
    function add(pinyin,source,sourceRecord){const sound=explainSound(pinyin,scheme);if(!sound)return;const code=sound.code;if(!byCode.has(code))byCode.set(code,{part,code,evidence:[]});const evidence={pinyin,source,...sourceRecord};const item=byCode.get(code);if(!item.evidence.some(e=>JSON.stringify(e)===JSON.stringify(evidence)))item.evidence.push(evidence)}
    const special=config.globalComponentRules[part]
    if(special)add(special.pinyin,'flypy:component-spelling-rule',{code:special.code,evidenceUrl:config.globalRuleEvidence.url})
    else{
     if(Object.hasOwn(aliases,part))for(const pinyin of aliases[part][0])add(pinyin,'radical:component-mnemonic',{})
     if(policy.alias==='union'||!Object.hasOwn(aliases,part))for(const field of policy.fields){const sourceRecord=props.characters[part]?.[field];if(sourceRecord)for(const pinyin of sourceRecord.readings)add(pinyin,`unihan17:${field}`,{sourceLine:sourceRecord.sourceLine,rawValue:sourceRecord.rawValue})}
    }
    const choices=[...byCode.values()].map(item=>{const key=JSON.stringify(item);if(!ids.has(key)){ids.set(key,components.length);components.push(item)}return ids.get(key)})
    cache.set(part,choices);return choices
   }
   for(const row of rows){
    if(!config.componentCounts.includes(row.parts.length)||row.parts.some(part=>!scalar(part))){rejected.length++;continue}
    const choices=row.parts.map(choicesFor)
    if(choices.some(c=>!c.length)){rejected.missingReading++;row.parts.forEach((part,i)=>{if(!choices[i].length)missing.set(part,(missing.get(part)??0)+1)});continue}
    eligibleSourceRows++
    const count=choices.reduce((n,c)=>n*c.length,1);maximumCombinations=Math.max(maximumCombinations,count);choiceDistribution[count]=(choiceDistribution[count]??0)+1
    if(count>1){multipleChoiceRows++;ambiguousRows.push([row.char,row.line,count])}
    if(count>config.maximumCombinationsPerSourceRow){rejected.combinationLimit++;capRows.push([row.char,row.line,count]);continue}
    let combinations=[[]];for(const choicesForPart of choices)combinations=combinations.flatMap(prefix=>choicesForPart.map(id=>[...prefix,id]))
    for(const componentIds of combinations){const code='OK'+componentIds.map(id=>components[id].code).join(''),key=row.char+'\0'+code;if(seen.has(key))continue;seen.add(key);candidateRows.push([row.char,code,componentIds,row.line])}
   }
   stats[policy.id]={candidateCharacters:new Set(candidateRows.map(r=>r[0])).size,candidatePairs:candidateRows.length,componentChoices:components.length,eligibleSourceRows,multipleChoiceRows,maximumCombinations,rejected,choiceDistribution,missingParts:[...missing].sort((a,b)=>b[1]-a[1]),capRows}
   pins.push(await writePinned(`${policy.id}.candidates.json`,jsonBytes({policy,components,rows:candidateRows})))
   // Full first provenance witness is deterministic and sufficient to reproduce every pair.
   componentCatalog.push({policy:policy.id,parts:[...cache].map(([part,values])=>[part,values.length])})
   if(policy.id==='baseline'){
    const prod=productionGenerate(rows,{readings,aliases,scheme,explainSound,config})
    assert.deepEqual(new Set(prod.records.map(r=>r.char+'\0'+r.code)),new Set(candidateRows.map(r=>r[0]+'\0'+r[1])))
    assert.equal(stats.baseline.candidateCharacters,89189);assert.equal(candidateRows.length,112553)
   }
  }
  pins.push(await writePinned('component-choice-counts.json',jsonBytes(componentCatalog)))
  const manifest={schemaVersion:1,purpose:'External research only; candidate policy comparison, no production adoption or official correctness claim',generator:await own(),sourceFiles,extractor:{file:'extract.py',sha256:sha(await readFile(join(HERE,'extract.py')))},policies,inputs,unihan:props.archive,unihanMember:props.member,propertyRecordCounts:props.propertyRecordCounts,globalComponentRules:config.globalComponentRules,globalRuleEvidence:config.globalRuleEvidence,maximumCombinationsPerSourceRow:config.maximumCombinationsPerSourceRow,sourceRows:rows.length,sourceCharacters:new Set(rows.map(r=>r.char)).size,statistics:stats,generated:pins,comparisonOnly:lock.comparisonOnly,comparisonOpened:false}
  await writeFile(join(HERE,'generation-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(stats,null,2))
 }finally{await server.close()}
}else if(process.argv[2]==='--compare'){
 const m=await readJson(join(HERE,'generation-manifest.json'));assert.equal(m.comparisonOpened,false);assert.deepEqual(await own(),m.generator)
 // Verify every complete candidate artifact before any comparator access.
 const generated={}
 for(const pin of m.generated){const b=verifyPinned(await readFile(join(HERE,pin.file)),pin,pin.file);if(pin.file.endsWith('.candidates.json')){const g=JSON.parse(b);generated[g.policy.id]=g}}
 assert.equal(Object.keys(generated).length,m.policies.length)
 const refBytes=verifyPinned(await readFile(REF),m.comparisonOnly.sha256,'comparison-only table')
 const ref=parseReference(refBytes.toString())
 const baseline=generated.baseline,basePairs=new Set(baseline.rows.map(r=>r[0]+'\0'+r[1])),baseExactPairs=new Set(baseline.rows.filter(r=>ref.pairs.has(r[0]+'\0'+r[1].toLowerCase())).map(r=>r[0]+'\0'+r[1])),baseExactChars=new Set([...baseExactPairs].map(k=>k.split('\0')[0]))
 assert.equal(baseExactPairs.size,59930);assert.equal(baseExactChars.size,59926)
 const results={},exactMaps={}
 for(const [id,g]of Object.entries(generated)){
  const pairSet=new Set(g.rows.map(r=>r[0]+'\0'+r[1]));const chars=new Set(g.rows.map(r=>r[0]));const exactRows=g.rows.filter(r=>ref.pairs.has(r[0]+'\0'+r[1].toLowerCase()));const exactPairs=new Set(exactRows.map(r=>r[0]+'\0'+r[1]));exactMaps[id]=exactPairs;const exactChars=new Set(exactRows.map(r=>r[0]));const newExactRows=exactRows.filter(r=>!baseExactPairs.has(r[0]+'\0'+r[1]));const newChars=new Set([...exactChars].filter(c=>!baseExactChars.has(c)))
  const newEvidenceCounter={},newPartCounter={},causes={onlyPreviouslyBlockedModernAlias:0,additionalFieldReading:0,mixed:0}
  const baseAvailable=new Map(baseline.components.map(c=>[c.part,new Set(baseline.components.filter(s=>s.part===c.part).map(s=>s.code))]))
  const baseModern=generated['union-modern'];const modernCodes=new Map();for(const c of baseModern.components){if(!modernCodes.has(c.part))modernCodes.set(c.part,new Set());modernCodes.get(c.part).add(c.code)}
  for(const r of newExactRows){let aliasCause=false,extraCause=false;for(const compId of r[2]){const c=g.components[compId];if(!baseAvailable.get(c.part)?.has(c.code)){newPartCounter[c.part+'→'+c.code]=(newPartCounter[c.part+'→'+c.code]??0)+1;const labels=[...new Set(c.evidence.map(e=>e.source))];for(const label of labels)newEvidenceCounter[label]=(newEvidenceCounter[label]??0)+1;if(modernCodes.get(c.part)?.has(c.code))aliasCause=true;else extraCause=true}}
   causes[aliasCause&&extraCause?'mixed':extraCause?'additionalFieldReading':'onlyPreviouslyBlockedModernAlias']++
  }
  results[id]={...m.statistics[id],confirmedCharacters:exactChars.size,confirmedPairs:exactPairs.size,incrementalConfirmedCharacters:newChars.size,incrementalConfirmedPairs:newExactRows.length,lostBaselineExactPairs:[...baseExactPairs].filter(k=>!exactPairs.has(k)).length,extraCandidatePairs:[...pairSet].filter(k=>!basePairs.has(k)).length,lostBaselineCandidatePairs:[...basePairs].filter(k=>!pairSet.has(k)).length,overlapWithoutExact:[...chars].filter(c=>ref.chars.has(c)&&!exactChars.has(c)).length,referenceCharactersWithoutCandidate:[...ref.chars].filter(c=>!chars.has(c)).length,referenceUnconfirmedCharacters:ref.chars.size-exactChars.size,unconfirmedCandidatePairs:g.rows.length-exactRows.length,incrementalPairCauses:causes,incrementalComponentEvidence:newEvidenceCounter,incrementalComponents:Object.entries(newPartCounter).sort((a,b)=>b[1]-a[1])}
  await writePinned(`${id}.comparison.json`,jsonBytes({policy:id,referenceSha256:sha(refBytes),newlyMatchedCharacters:[...newChars].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0)),newExactCandidateRows:newExactRows,componentCatalog:g.components,allCandidateExactFlags:g.rows.map(r=>ref.pairs.has(r[0]+'\0'+r[1].toLowerCase())?1:0)}))
 }
 const full=exactMaps['union-all'],singlePropertyAblation={}
 for(const field of extras){const ablated=exactMaps[`union-all-except-${field}`];singlePropertyAblation[field]={uniqueExactPairs:[...full].filter(k=>!ablated.has(k)).length,uniqueExactCharacters:new Set([...full].filter(k=>!ablated.has(k)).map(k=>k.split('\0')[0])).size}}
 const summary={schemaVersion:1,method:'All policies and candidate corpora pinned and written in --generate mode before --compare reads fixed table. No per-character oracle tuning. All alternative property identities retained at component-code level. Exact agreement is comparison evidence only.',generator:m.generator,generationManifestSha256:sha(await readFile(join(HERE,'generation-manifest.json'))),reference:{characters:ref.chars.size,pairs:ref.pairs.size,sha256:sha(refBytes)},policies:results,singlePropertyAblation}
 await writeFile(join(HERE,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({reference:summary.reference,policies:Object.fromEntries(Object.entries(results).map(([id,s])=>[id,{candidates:s.candidateCharacters,pairs:s.candidatePairs,exact:s.confirmedCharacters,exactPairs:s.confirmedPairs,newChars:s.incrementalConfirmedCharacters,newPairs:s.incrementalConfirmedPairs,max:s.maximumCombinations,cap:s.rejected.combinationLimit}])),singlePropertyAblation},null,2))
}else throw Error('Use --generate then --compare')
