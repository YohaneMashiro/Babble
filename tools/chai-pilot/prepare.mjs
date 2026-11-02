#!/usr/bin/env node
// Original Babble build adapter (MIT). No upstream implementation is bundled.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireExternalPath } from '../../scripts/official-ix-audit.mjs';

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);

export function verifyIntegrity(bytes, integrity) {
  const [algorithm, expected] = integrity.split('-');
  if (algorithm !== 'sha512' || hash(bytes, algorithm, 'base64') !== expected) throw new Error('Pinned dependency tarball integrity mismatch.');
}

export async function prepare(chaiRoot) {
  if (typeof nodeModule.stripTypeScriptTypes !== 'function') throw new Error('Optional Chai preparation requires Node22.13 or newer.');
  const checkout = await requireExternalPath(chaiRoot);
  const config = JSON.parse(await readFile(path.join(DIRECTORY, 'config.json'), 'utf8'));
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== config.upstreamCommit) throw new Error(`Use the pinned Chai checkout ${config.upstreamCommit}.`);
  if (git('status', '--porcelain', '--untracked-files=no', '--', 'packages/hanzi-chai/src')) throw new Error('Chai core source has tracked local changes.');
  const core = path.join(checkout, 'packages/hanzi-chai');
  await requireExternalPath(path.join(core, 'node_modules'));
  await requireExternalPath(path.join(core, 'dist'));
  const dependencies = JSON.parse(await readFile(path.join(DIRECTORY, 'dependencies.lock.json'), 'utf8'));
  const temporary = await mkdtemp(path.join(core, '.babble-build-'));
  try {
    await mkdir(path.join(core, 'node_modules'), { recursive: true });
    // These immutable tarballs contain only the six algorithm runtime dependencies.
    // curl is used because it also works on WSL hosts where Node HTTP cannot connect.
    for (const dependency of dependencies) {
      if (!/^[a-z][a-z0-9-]*$/u.test(dependency.name) || !/^\d+\.\d+\.\d+$/u.test(dependency.version)) throw new Error('Invalid dependency lock.');
      const tarball = path.join(temporary, `${dependency.name}.tgz`);
      const url = `https://registry.npmjs.org/${dependency.name}/-/${dependency.name}-${dependency.version}.tgz`;
      execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '60', '--output', tarball, url], { stdio: 'pipe', timeout: 65000 });
      verifyIntegrity(await readFile(tarball), dependency.integrity);
      const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
      if (entries.some((entry) => !entry.startsWith('package/') || entry.split('/').includes('..'))) throw new Error('Unsafe dependency archive path.');
      const extracted = path.join(temporary, dependency.name);
      await mkdir(extracted);
      execFileSync('tar', ['-xzf', tarball, '--strip-components=1', '-C', extracted], { stdio: 'pipe' });
      const pkg = JSON.parse(await readFile(path.join(extracted, 'package.json'), 'utf8'));
      if (pkg.name !== dependency.name || pkg.version !== dependency.version) throw new Error('Dependency archive name/version mismatch.');
      const destination = path.join(core, 'node_modules', dependency.name);
      await requireExternalPath(destination);
      await rm(destination, { recursive: true, force: true });
      await rename(extracted, destination);
    }
    const sourceHashes = {};
    const artifactHashes = {};
    const staged = path.join(temporary, 'dist');
    await mkdir(staged);
    const trackedSources = git('ls-files', '--', 'packages/hanzi-chai/src/*.ts').split('\n');
    for (const sourcePath of trackedSources.sort()) {
      const name = path.basename(sourcePath);
      const source = await readFile(path.join(core, 'src', name));
      // Transform syntax only, without typechecking or changing the upstream algorithms.
      const output = nodeModule.stripTypeScriptTypes(source.toString('utf8'), { mode: 'transform' });
      const target = name.replace(/\.ts$/u, '.js');
      await writeFile(path.join(staged, target), output);
      sourceHashes[name] = hash(source);
      artifactHashes[target] = hash(output);
    }
    const manifest = { schemaVersion: 1, upstreamCommit: config.upstreamCommit, method: 'Node stripTypeScriptTypes(mode=transform); no typecheck', nodeVersion: process.version, sources: sourceHashes, artifacts: artifactHashes, dependencies };
    await writeFile(path.join(staged, 'babble-build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const destination = path.join(core, 'dist');
    await requireExternalPath(destination);
    await rm(destination, { recursive: true, force: true });
    await rename(staged, destination);
    return { checkout, commit: config.upstreamCommit, dependencies: dependencies.length, sourceFiles: Object.keys(sourceHashes).length, manifest: path.join(destination, 'babble-build-manifest.json') };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('Usage: node tools/chai-pilot/prepare.mjs --chai-root /external/pinned-checkout\nRequires Node22.13+, git, curl and tar in WSL. Rebuilds only external core/dist and six pinned dependency directories. Does not download glyphs or frontend dependencies.');
  else if (process.argv.length !== 4 || process.argv[2] !== '--chai-root') { console.error('Use --chai-root /external/pinned-checkout or --help.'); process.exitCode = 1; }
  else prepare(process.argv[3]).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(`Chai prepare: ${error.message}`); process.exitCode = 1; });
}
