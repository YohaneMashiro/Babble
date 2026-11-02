import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const root='/mnt/d/document/research/alive_babble/xiaohe-learn'
const out='/root/.cache/babble-coverage-next/decomposition'
const {generateCandidates}=await import(`${root}/tools/component-spelling/generate.mjs`)
const {parseAliases,parseRadical}=await import(`${root}/tools/coverage-research/run.mjs`)
const {createServer}=await import(`${root}/node_modules/vite/dist/node/index.js`)
const server=await createServer({root,configFile:false,logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null}})
try {
 const {explainSound}=await server.ssrLoadModule('/src/domain/sound.ts')
 const readings=JSON.parse(await readFile(`${root}/src/data/generated/readings.json`)).characters
 const scheme=JSON.parse(await readFile(`${root}/src/data/generated/sound-mapping.json`))
 const aliases=parseAliases(await readFile(`${root}/tools/component-spelling/inputs/gen_dict.py`,'utf8'))
 const config=JSON.parse(await readFile(`${root}/tools/component-spelling/config.json`))
 const context={readings,scheme,aliases,config,explainSound}
 const chars=new Set([...Object.keys(readings),...Object.keys(aliases),...Object.keys(config.globalComponentRules)])
 const choices={}
 for(const part of chars){
   const special=config.globalComponentRules[part]
   if(special){choices[part]=[{part,...special,sourceId:'flypy:component-spelling-rule'}];continue}
   const mnemonic=Object.hasOwn(aliases,part), values=mnemonic?aliases[part][0]:readings[part]?.readings??[]
   const seen=new Set(),list=[]
   for(const pinyin of values){const sound=explainSound(pinyin,scheme);if(!sound||seen.has(sound.code))continue;seen.add(sound.code); const fields=readings[part]?.readingSources?.[pinyin]??[]; list.push({part,pinyin,code:sound.code,sourceId:mnemonic?'radical:component-mnemonic':`unihan:${fields.join('+')}`})}
   if(list.length)choices[part]=list
 }
 await writeFile(`${out}/sound-choices.json`,JSON.stringify(choices)+'\n')
 const rows=parseRadical(await readFile(`${root}/tools/component-spelling/inputs/radical.yaml`,'utf8'))
 const generated=generateCandidates(rows,context)
 const payload=JSON.stringify(generated)+'\n'
 await writeFile(`${out}/baseline-candidates.json`,payload)
 const summary={candidateChars:new Set(generated.records.map(x=>x.char)).size,pairs:generated.records.length,sha256:createHash('sha256').update(payload).digest('hex'),rejected:generated.rejected,maxCombinations:generated.maximumCombinations}
 await writeFile(`${out}/baseline-generation-summary.json`,JSON.stringify(summary,null,2)+'\n')
 console.log(JSON.stringify(summary))
}finally{await server.close()}
