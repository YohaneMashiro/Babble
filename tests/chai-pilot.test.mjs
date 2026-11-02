import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { candidateFromSequence, compareReference, convertApiModels, parseRootInventories, requireExternal, validateDestinations } from '../tools/chai-pilot/run.mjs';
import { verifyIntegrity } from '../tools/chai-pilot/prepare.mjs';
import { parseSnapshot, PROJECT_ROOT } from '../scripts/official-ix-audit.mjs';

const config = JSON.parse(await readFile(new URL('../tools/chai-pilot/config.json', import.meta.url), 'utf8'));
const inventories = parseRootInventories(await readFile(new URL('../tools/libre-flypy-audit/src/roots.rs', import.meta.url), 'utf8'));
const directories = [];
async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'babble-chai-test-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
const reference = (fields) => parseSnapshot(Buffer.from(JSON.stringify({ 我: { 1: 'wopd-', 2: '丿 丶', 3: '丿 一 丨 一 乛 丿 丶', 4: 'wǒ', ...fields } }))).records.我;

describe('Chai external experiment boundary', () => {
  it('preserves numeric and astral glyph references without inventing named components', () => {
    const model = { unicode: 0x4eba, glyphs: JSON.stringify([{ type: 'identity', source: 0x20000 }, { type: 'compound', operandList: [0x4e00, 0x4e28], operator: '⿱' }]), ambiguous: 1 };
    expect(convertApiModels([model])[0]).toMatchObject({ ambiguous: true, glyphs: [{ type: 'identity', source: '𠀀' }, { type: 'compound', operandList: ['一', '丨'] }] });
    expect(() => convertApiModels([model, model])).toThrow(/duplicate/);
    expect(() => convertApiModels([{ ...model, glyphs: [{ type: 'identity', source: '\uD800' }] }])).toThrow(/scalar/);
    expect(() => convertApiModels([{ ...model, unicode: 0xd800 }])).toThrow(/scalar/);
    expect(() => convertApiModels([{ ...model, glyphs: [{ type: 'unknown' }] }])).toThrow(/Unsupported/);
    expect(() => convertApiModels([{ ...model, glyphs: [] }])).toThrow(/placeholder/);
  });

  it('honors asymmetric root eligibility and refuses to duplicate a single whole-character root', () => {
    expect(candidateFromSequence(['亻', '小'], inventories, config)).toMatchObject({ status: 'candidate', shapeCode: 'rx' });
    expect(candidateFromSequence(['3', '4'], inventories, config)).toMatchObject({ first: { root: '丿' }, last: { root: '丶' }, shapeCode: 'pd' });
    expect(candidateFromSequence(['木'], inventories, config)).toEqual({ status: 'insufficient-roots', sequence: ['木'] });
    const asymmetric = { first: new Map([['甲', 'j']]), last: new Map([['乙', 'v']]) };
    expect(candidateFromSequence(['乙', '甲'], asymmetric, config).status).toBe('endpoint-policy-gap');
  });

  it('requires both root labels and shape keys, rejecting anomalies and code-only coincidences', () => {
    const candidate = candidateFromSequence(['3', '4'], inventories, config);
    expect(compareReference(candidate, reference()).status).toBe('roots-and-shape-match');
    expect(compareReference({ ...candidate, first: { root: '人', key: 'p' } }, reference())).toMatchObject({ status: 'mismatch', shapeCodeMatch: true, rootMatch: false });
    expect(compareReference(candidate, reference({ 1: 'wopd?' })).status).toBe('reference-anomaly');
    expect(compareReference(candidate, reference({ 2: '丿 一 丶' })).status).toBe('reference-anomaly');
    expect(compareReference(candidate, reference({ 4: 'wǒ \uE7C7' })).status).toBe('reference-anomaly');
    expect(compareReference(candidate, undefined).status).toBe('reference-missing');
    const annotated = { ...candidate, first: { root: '夬', key: 'p' } };
    expect(compareReference(annotated, reference({ 2: '夬guài 丶' })).rootMatch).toBe(true);
  });

  it('allows new external report directories while rejecting project/symlink destinations and input replacement', async () => {
    const directory = await temporary();
    const chaiRoot = path.join(directory, 'chai');
    const repertoire = path.join(directory, 'glyphs.json');
    await mkdir(chaiRoot);
    await writeFile(repertoire, 'original');
    const output = path.join(directory, 'new', 'nested', 'report.json');
    expect((await validateDestinations({ chaiRoot, repertoire, output })).output).toBe(output);
    await expect(requireExternal(path.join(PROJECT_ROOT, 'new-raw.json'))).rejects.toThrow(/outside/);
    const alias = path.join(directory, 'alias.json');
    await symlink(repertoire, alias);
    await expect(validateDestinations({ chaiRoot, repertoire, output: alias })).rejects.toThrow(/overwrite/);
    await expect(validateDestinations({ chaiRoot, repertoire, output: path.join(chaiRoot, 'dist', 'report.json') })).rejects.toThrow(/overwrite/);
    await symlink(PROJECT_ROOT, path.join(directory, 'project-link'));
    await expect(requireExternal(path.join(directory, 'project-link', 'new-raw.json'))).rejects.toThrow(/outside/);
    expect(await readFile(repertoire, 'utf8')).toBe('original');
  });

  it('checks the pinned runtime tarball before extraction or execution', () => {
    const bytes = Buffer.from('fixed dependency fixture');
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    expect(() => verifyIntegrity(bytes, integrity)).not.toThrow();
    expect(() => verifyIntegrity(Buffer.from('changed dependency'), integrity)).toThrow(/integrity/);
    expect(() => verifyIntegrity(bytes, 'sha1-unsupported')).toThrow(/integrity/);
  });
});
