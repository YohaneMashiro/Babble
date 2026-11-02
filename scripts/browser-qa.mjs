// Shared browser-only QA setup; these tools stay outside product dependencies.
import { mkdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function createQaBrowser() {
  const engine = process.env.BROWSER_ENGINE || 'chromium'
  if (!['chromium', 'firefox', 'webkit'].includes(engine)) {
    throw new Error(`Unknown BROWSER_ENGINE: ${engine}; use chromium, firefox or webkit.`)
  }
  const playwright = await import(process.env.PLAYWRIGHT_IMPORT || 'playwright')
  const output = process.env.QA_OUTPUT_DIR
    ? pathToFileURL(`${resolve(process.env.QA_OUTPUT_DIR)}${sep}`)
    : new URL(engine === 'chromium' ? '../test-results/' : `../test-results/${engine}/`, import.meta.url)
  await mkdir(output, { recursive: true })
  const browser = await playwright[engine].launch({ headless: true })
  return { browser, engine, output }
}
