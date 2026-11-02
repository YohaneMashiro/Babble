// MIT wrapper; exported Unicode data and source aliases retain upstream terms.
// Comparator-free export of the same union-all policy used by run.mjs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAliases, verifyPinned } from '/mnt/d/document/research/alive_babble/xiaohe-learn/tools/coverage-research/run.mjs'
const ROOT='/mnt/d/document/research/alive_babble/xiaohe-learn',HERE='/root/.cache/babble-coverage-next/reading-policy'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const m=JSON.parse(await readFile(join(HERE,'generation-manifest.json'))),inputs=[]
async function pinned(path,pin){const bytes=verifyPinned(await readFile(path),pin,path);inputs.push({path,bytes:bytes.length,sha256:hash(bytes)});return bytes}
for(const pin of m.sourceFiles)await pinned(pin.path,pin)
const lock=JSON.parse(await readFile(join(ROOT,'tools/component-spelling/inputs.lock.json')))
const aliasBytes=await pinned(join(ROOT,'tools/component-spelling/inputs/gen_dict.py'),lock.files['tools/component-spelling/inputs/gen_dict.py'])
const aliases=parseAliases(aliasBytes.toString())
const props=JSON.parse(await pinned(join(HERE,'unihan17-properties.json'),'50a56ffb1db37770e6d50f102476fca892f3b3965ea71f3d9d4e2f16d58b8baf'))
const scheme=JSON.parse(await pinned(join(ROOT,'src/data/generated/sound-mapping.json'),lock.canonicalInputs['src/data/generated/sound-mapping.json']))
const policy=m.policies.find(p=>p.id==='union-all'), choices={}
const {createServer}=await import(join(ROOT,'node_modules/vite/dist/node/index.js'))
const server=await createServer({root:ROOT,configFile:false,logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null}})
try{
 const {explainSound}=await server.ssrLoadModule('/src/domain/sound.ts')
 for(const part of [...new Set([...Object.keys(props.characters),...Object.keys(aliases),...Object.keys(m.globalComponentRules)])].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0))){
  const byCode=new Map()
  function add(pinyin,source,record){const sound=explainSound(pinyin,scheme);if(!sound)return;const code=sound.code;if(!byCode.has(code))byCode.set(code,{part,pinyin,code,sourceId:source,evidence:[]});const e={pinyin,source,...record};const item=byCode.get(code);if(!item.evidence.some(x=>JSON.stringify(x)===JSON.stringify(e)))item.evidence.push(e)}
  const special=m.globalComponentRules[part]
  if(special)add(special.pinyin,'flypy:component-spelling-rule',{code:special.code,evidenceUrl:m.globalRuleEvidence.url})
  else{
   if(Object.hasOwn(aliases,part))for(const pinyin of aliases[part][0])add(pinyin,'radical:component-mnemonic',{})
   for(const field of policy.fields){const sourceRecord=props.characters[part]?.[field];if(sourceRecord)for(const pinyin of sourceRecord.readings)add(pinyin,`unihan17:${field}`,{sourceLine:sourceRecord.sourceLine,rawValue:sourceRecord.rawValue})}
  }
  if(byCode.size)choices[part]=[...byCode.values()]
 }
 // Source-specific first witnesses must match the comparator-free broad export.
 const corpus=JSON.parse(await pinned(join(HERE,'union-all.candidates.json'),m.generated.find(x=>x.file==='union-all.candidates.json')))
 for(const c of corpus.components){const matching=choices[c.part]?.find(x=>x.code===c.code);assert(matching,`${c.part} ${c.code}`);assert.deepEqual(matching.evidence,c.evidence)}
 const bytes=Buffer.from(JSON.stringify(choices)+'\n'),file='union-all-component-choices.json'
 await writeFile(join(HERE,file),bytes)
 const manifest={schemaVersion:1,purpose:'Comparator-free broad per-component union-all choices for independent decomposition experiments; no full-character codes inferred from comparator',policy,generator:{path:fileURLToPath(import.meta.url),sha256:hash(await readFile(fileURLToPath(import.meta.url)))},inputs,upstreamArchive:props.archive,sourceManifestSha256:hash(await readFile(join(HERE,'generation-manifest.json'))),parts:Object.keys(choices).length,codeChoices:Object.values(choices).reduce((n,r)=>n+r.length,0),export:{file,bytes:bytes.length,sha256:hash(bytes)},comparisonOpened:false}
 await writeFile(join(HERE,'union-all-component-choices.manifest.json'),JSON.stringify(manifest,null,2)+'\n')
 console.log(JSON.stringify({parts:manifest.parts,codeChoices:manifest.codeChoices,export:manifest.export}))
}finally{await server.close()}
