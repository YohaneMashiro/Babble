import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist')
await readFile(join(output, 'index.html'))
const temporary = await mkdtemp(join(tmpdir(), 'xiaohe-source-'))
try {
  const sourceDir = join(output, 'source')
  const licenseDir = join(output, 'licenses')
  await mkdir(sourceDir, { recursive: true })
  await mkdir(licenseDir, { recursive: true })
  // Explicit paths keep local credentials, browser caches and unrelated files out.
  const included = ['README.md', 'README.en.md', '.github', 'LICENSE', 'LICENSE-CODE', 'the_Tower_of_Babel.txt', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', '.gitignore', 'src', 'tests', 'scripts', 'docs', 'data', 'tools', 'public/models/g2pw']
  const archive = join(temporary, 'babble-source.tgz')
  execFileSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--exclude=target', '--exclude=__pycache__', '--exclude=.DS_Store', '--exclude=public/models/g2pw/*.bin', '--exclude=public/models/g2pw/runtime/*.wasm', '--exclude=public/models/g2pw/runtime/*.mjs', '-czf', archive, ...included], { cwd: root })
  await cp(archive, join(sourceDir, 'babble-source.tgz'))
  for (const file of ['LICENSE', 'LICENSE-CODE']) await cp(join(root, file), join(licenseDir, file))
  for (const file of await readdir(join(root, 'data'))) {
    if (file.startsWith('NOTICE') || file.endsWith('.lock.json')) await cp(join(root, 'data', file), join(licenseDir, file))
  }
  console.log('Packaged complete source and dataset notices in dist/source and dist/licenses.')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
