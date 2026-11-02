#!/usr/bin/env node
// Original Babble adapter, MIT (LICENSE-CODE). Chai remains an external GPL-3.0-only program.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizedReferenceRoot, parseSnapshot, requireExternalPath } from '../../scripts/official-ix-audit.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG_PATH = path.join(REPO, 'tools/chai-pilot/config.json');
const ROOTS_PATH = path.join(REPO, 'tools/libre-flypy-audit/src/roots.rs');
const MAX_BYTES = 64 * 1024 * 1024;
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function convertApiModels(models) {
  if (!Array.isArray(models) || !models.length || models.length > 200000) throw new Error('Invalid Chai repertoire: expected a nonempty array (at most 200000 records).');
  const seen = new Set();
  return models.map((model) => {
    if (!Number.isInteger(model.unicode) || model.unicode < 0 || model.unicode > 0x10ffff || (model.unicode >= 0xd800 && model.unicode <= 0xdfff) || seen.has(model.unicode)) throw new Error('Invalid or duplicate Chai Unicode scalar.');
    seen.add(model.unicode);
    const glyphs = typeof model.glyphs === 'string' ? JSON.parse(model.glyphs) : model.glyphs;
    if (!Array.isArray(glyphs) || !glyphs.length) throw new Error('Invalid or empty Chai glyph list; placeholder geometry is not accepted.');
    const scalar = (value) => {
      if (typeof value === 'string' && [...value].length === 1 && !(value.codePointAt(0) >= 0xd800 && value.codePointAt(0) <= 0xdfff)) return value;
      if (Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)) return String.fromCodePoint(value);
      throw new Error('Invalid referenced Chai Unicode scalar.');
    };
    return { ...model, ambiguous: model.ambiguous === 1 || model.ambiguous === true, glyphs: glyphs.map((glyph) => {
      if (!glyph || typeof glyph !== 'object') throw new Error('Invalid Chai glyph.');
      if (glyph.type === 'basic_component') return glyph;
      if (glyph.type === 'derived_component' || glyph.type === 'identity') return { ...glyph, source: scalar(glyph.source) };
      if (glyph.type === 'compound' || glyph.type === 'spliced_component') {
        if (!Array.isArray(glyph.operandList)) throw new Error('Invalid Chai operands.');
        return { ...glyph, operandList: glyph.operandList.map(scalar) };
      }
      throw new Error(`Unsupported Chai glyph type: ${glyph.type}`);
    }) };
  });
}

export function parseRootInventories(source) {
  const sections = source.split(/let only_in_(?:firsts|lasts)\s*=/u);
  if (sections.length !== 3) throw new Error('Unsupported libre-flypy root source format.');
  const parse = (part) => new Map([...part.matchAll(/\('([^']+)', '([a-z])'\)/gu)].map((m) => [m[1], m[2]]));
  const common = parse(sections[0]);
  if (common.size < 100) throw new Error('Root source appears incomplete.');
  return { first: new Map([...common, ...parse(sections[1])]), last: new Map([...common, ...parse(sections[2])]) };
}

export function candidateFromSequence(names, inventories, config) {
  if (names.length < 2) return { status: 'insufficient-roots', sequence: names };
  const endpoint = (name, side) => config.strokeClasses[name] ?? (inventories[side].has(name) ? { root: name, key: inventories[side].get(name) } : undefined);
  const first = endpoint(names[0], 'first');
  const last = endpoint(names.at(-1), 'last');
  if (!first || !last) return { status: 'endpoint-policy-gap', sequence: names, first: first ?? null, last: last ?? null };
  return { status: 'candidate', sequence: names, first, last, shapeCode: first.key + last.key };
}

export function compareReference(candidate, record) {
  if (!record) return { status: 'reference-missing' };
  const roots = record.roots.map(normalizedReferenceRoot);
  const codes = record.codes.map((code) => code.toLowerCase());
  if (record.anomalies.length || roots.length !== 2 || codes.length === 0) return { status: 'reference-anomaly', anomalies: record.anomalies };
  if (candidate.status !== 'candidate') return { status: 'configuration-gap' };
  const rootMatch = candidate.first.root === roots[0] && candidate.last.root === roots[1];
  const shapeCodeMatch = codes.some((code) => code.slice(2) === candidate.shapeCode);
  return { status: rootMatch && shapeCodeMatch ? 'roots-and-shape-match' : 'mismatch', rootMatch, shapeCodeMatch, expectedRoots: roots, expectedShapeCodes: [...new Set(codes.map((code) => code.slice(2)))] };
}

export const requireExternal = requireExternalPath;

const isWithin = (directory, file) => {
  const relative = path.relative(directory, file);
  return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

export async function validateDestinations(options) {
  const chaiRoot = await requireExternal(options.chaiRoot);
  const repertoire = await requireExternal(options.repertoire);
  const reference = options.reference ? await requireExternal(options.reference) : undefined;
  const output = await requireExternal(options.output);
  if (output === repertoire || output === reference || isWithin(chaiRoot, output) || isWithin(output, repertoire) || (reference && isWithin(output, reference))) throw new Error('Report output cannot overwrite an input or the external Chai checkout.');
  return { ...options, chaiRoot, repertoire, reference, output };
}

async function readBounded(file) {
  if ((await stat(file)).size > MAX_BYTES) throw new Error('Research input exceeds 64 MiB.');
  return readFile(file);
}

async function hashTree(directory) {
  const hashes = {};
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /\.(?:js|json|ts)$/u.test(file)) hashes[path.relative(directory, file)] = digest(await readFile(file));
    }
  }
  await visit(directory);
  return { sha256: digest(JSON.stringify(hashes)), files: hashes };
}

async function verifyBuild(coreDir, commit) {
  const manifest = JSON.parse(await readFile(path.join(coreDir, 'dist/babble-build-manifest.json'), 'utf8'));
  if (manifest.upstreamCommit !== commit || !manifest.sources || !manifest.artifacts) throw new Error('Invalid Chai build manifest. Run tools/chai-pilot/prepare.mjs.');
  for (const [directory, hashes] of [['src', manifest.sources], ['dist', manifest.artifacts]]) {
    if (Object.keys(hashes).length < 10) throw new Error('Incomplete Chai build manifest.');
    for (const [name, expected] of Object.entries(hashes)) {
      if (name !== path.basename(name) || digest(await readFile(path.join(coreDir, directory, name))) !== expected) throw new Error(`Stale or modified Chai ${directory}/${name}; rebuild the external core.`);
    }
  }
  return manifest;
}

export async function runPilot(options) {
  const chaiRoot = await requireExternal(options.chaiRoot);
  const repertoireFile = await requireExternal(options.repertoire);
  const referenceFile = options.reference ? await requireExternal(options.reference) : undefined;
  const configBytes = await readFile(CONFIG_PATH);
  const config = JSON.parse(configBytes);
  const git = (...args) => execFileSync('git', ['-C', chaiRoot, ...args], { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  if (commit !== config.upstreamCommit) throw new Error(`Chai checkout must be pinned at ${config.upstreamCommit}.`);
  if (git('status', '--porcelain', '--untracked-files=no', '--', 'packages/hanzi-chai/src', 'src/api.ts', 'scripts/fetch.ts')) throw new Error('Chai source has tracked local changes.');
  const coreDir = path.join(chaiRoot, 'packages/hanzi-chai');
  const buildManifest = await verifyBuild(coreDir, commit);
  const core = await import(pathToFileURL(path.join(coreDir, 'dist/index.js')).href);
  const repertoireBytes = await readBounded(repertoireFile);
  const raw = new core.原始字库(convertApiModels(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(repertoireBytes))));
  const resolved = raw.确定({}, [], config.glyphSources);
  if (!resolved.ok) throw resolved.error;
  const library = resolved.value;
  const rootBytes = await readFile(ROOTS_PATH);
  const rootLock = JSON.parse(await readFile(path.join(REPO, 'data/shape-sources.lock.json'), 'utf8'));
  if (digest(rootBytes) !== rootLock.files['src/roots.rs']) throw new Error('Licensed root source differs from the existing pinned lock.');
  const rootInventories = parseRootInventories(rootBytes.toString('utf8'));
  const availableRoots = new Map();
  const missingRoots = [];
  for (const [root, key] of new Map([...rootInventories.first, ...rootInventories.last])) {
    const entry = raw.校验(root);
    if (entry) availableRoots.set(entry.character, key);
    else missingRoots.push(root);
  }
  for (const [kind, { key }] of Object.entries(config.strokeClasses)) availableRoots.set(core.笔画.创建(Number(kind)), key);
  const referenceBytes = referenceFile ? await readBounded(referenceFile) : undefined;
  const reference = referenceBytes ? parseSnapshot(referenceBytes).records : undefined;
  const targets = [...new Set(options.characters ? [...options.characters] : [...config.defaultCharacters])];
  if (!targets.length || targets.length > 512 || targets.some((character) => !/\p{Script=Han}/u.test(character))) throw new Error('Pilot requires 1–512 distinct Han characters.');
  const controls = [...new Set(config.controlCharacters)].filter((char) => !targets.includes(char));
  const results = [];
  for (const character of [...targets, ...controls]) {
    const entry = raw.校验(character);
    const cohort = targets.includes(character) ? 'target' : 'control';
    if (!entry) { results.push({ character, cohort, status: 'glyph-missing', candidates: [] }); continue; }
    const decisions = new Map(availableRoots);
    if (config.excludeTargetAsRoot) decisions.delete(entry.character);
    const base = { 分析配置: config.analysis, 决策: decisions, 决策空间: new Map(), 线性化决策: decisions, 自定义分析映射: new Map(), 动态自定义分析映射: new Map(), 字形来源列表: config.glyphSources };
    try {
      const analyzed = library.分析(base, new Set([entry.character]));
      if (!analyzed.ok) { results.push({ character, cohort, status: 'analysis-error', error: String(analyzed.error), candidates: [] }); continue; }
      const sequences = analyzed.value.分析结果.get(entry.character) ?? [];
      const candidates = sequences.map((item) => {
        const candidate = candidateFromSequence(item.字根序列.map((root) => root.获取名称()), rootInventories, config);
        return { ...candidate, glyphType: item.类型, comparison: reference ? compareReference(candidate, reference[character]) : { status: 'not-compared' } };
      });
      results.push({ character, cohort, status: candidates.length ? 'analyzed' : 'no-analysis', candidates });
    } catch (error) { results.push({ character, cohort, status: 'analysis-error', error: String(error), candidates: [] }); }
  }
  const countCohort = (cohort) => {
    const items = results.filter((item) => item.cohort === cohort);
    return { characters: items.length, analyzed: items.filter((item) => item.status === 'analyzed').length, withCandidate: items.filter((item) => item.candidates.some((candidate) => candidate.status === 'candidate')).length, withReferenceMatch: items.filter((item) => item.candidates.some((candidate) => candidate.comparison.status === 'roots-and-shape-match')).length, errors: items.filter((item) => item.status === 'analysis-error').length };
  };
  return { schemaVersion: 1, tool: 'babble-chai-pilot', generatedAt: new Date().toISOString(), mode: 'research-only-no-runtime-import', metadata: { upstream: { repository: 'https://github.com/hanzi-chai/hanzi-chai.github.io', commit, codeLicense: 'GPL-3.0-only', coreSources: await hashTree(path.join(coreDir, 'src')), coreArtifacts: await hashTree(path.join(coreDir, 'dist')), buildManifest }, repertoire: { path: repertoireFile, bytes: repertoireBytes.length, sha256: digest(repertoireBytes), sourceUrl: 'https://api.chaifen.app/repertoire/all', dataLicense: 'unconfirmed; external research input only' }, reference: referenceBytes ? { path: referenceFile, bytes: referenceBytes.length, sha256: digest(referenceBytes), usedOnlyAfterAnalysis: true } : null, config: { ...config, sha256: digest(configBytes) }, rootInventory: { source: 'tools/libre-flypy-audit/src/roots.rs', sha256: digest(rootBytes), license: 'AGPL-3.0-only', first: rootInventories.first.size, last: rootInventories.last.size, missingGlyphs: missingRoots } }, summary: { target: countCohort('target'), control: countCohort('control') }, results };
}

async function main() {
  const options = {};
  const names = { '--chai-root': 'chaiRoot', '--repertoire': 'repertoire', '--reference': 'reference', '--characters': 'characters', '--output': 'output' };
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log('Usage: node tools/chai-pilot/run.mjs --chai-root /external/chai-checkout --repertoire /external/repertoire-api.json [--reference /external/ixdata.json] [--characters 汉字] --output /external/report.json\nOnly a summary is printed; detailed research output stays outside the repository.'); return; }
  for (let i = 0; i < args.length; i += 2) {
    const name = names[args[i]];
    if (!name || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Invalid option ${args[i]}. Use --help.`);
    if (options[name]) throw new Error(`Duplicate option ${args[i]}.`);
    options[name] = args[i + 1];
  }
  if (!options.chaiRoot || !options.repertoire || !options.output) throw new Error('--chai-root, --repertoire and --output are required.');
  const validated = await validateDestinations(options);
  const output = validated.output;
  const report = await runPilot(validated);
  await mkdir(path.dirname(output), { recursive: true });
  await validateDestinations(validated);
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, output);
  console.log(JSON.stringify({ ...report.summary, report: output }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`Chai pilot: ${error.message}`); process.exitCode = 1; });
