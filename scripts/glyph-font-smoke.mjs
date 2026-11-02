// Browser-only checks for on-demand licensed glyph rendering, separate from code coverage.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createQaBrowser } from './browser-qa.mjs'

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const { browser, engine, output } = await createQaBrowser()
const AxeBuilder = process.env.AXE_IMPORT ? (await import(process.env.AXE_IMPORT)).default : null
const contexts = [], passed = [], accessibility = [], errors = [], faults = [], requests = [], glyphs = []
let failure = null
const isFont = url => /glyph-[0-9a-f]+-[^/]+\.woff2(?:\?|$)/.test(url)
const check = async (name, action) => { await action(); passed.push(name); console.log('PASS ' + name) }
const blur = page => page.evaluate(() => document.activeElement?.blur())
const states = page => page.locator('.auxiliary-code-slot').evaluateAll(els => els.map(el => el.dataset.state))

async function createPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  contexts.push(context)
  await context.addInitScript(() => { localStorage.setItem('babble:learning-level', 'yinxing'); localStorage.setItem('xiaohe:auto-hints', 'false') })
  const page = await context.newPage()
  page.__qaExpectedFontFault = false
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    if (page.__qaExpectedFontFault && /Failed to load resource|NS_ERROR|Load failed|NetworkError/i.test(message.text())) faults.push(message.text())
    else errors.push(message.text())
  })
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), postData: request.postData() }))
  await page.goto(baseURL)
  await page.waitForFunction(() => document.querySelector('.storage-status')?.dataset.status === 'saved')
  return page
}
async function importText(page, text) {
  if (await page.locator('.text-context').count()) await page.getByRole('button', { name: '编辑文本', exact: true }).click()
  else await page.getByRole('navigation', { name: '学习模式' }).getByRole('button', { name: '自定义文本', exact: true }).click()
  await page.getByLabel('练习文本', { exact: true }).fill(text)
  await page.getByRole('dialog', { name: '自定义文本', exact: true }).locator('button[type="submit"]').click()
  await page.locator('.text-context').waitFor()
  await page.waitForFunction(() => document.querySelector('.auxiliary-storage')?.dataset.status === 'saved')
  await blur(page)
}
async function waitFont(page, status = 'ready') {
  await page.locator(`.character-stage > .glyph-font-status[data-status="${status}"]`).waitFor({ state: 'attached' })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}
async function audit(page, view) {
  if (!AxeBuilder) return
  await page.waitForTimeout(200)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))
  accessibility.push({ view, violations })
  assert.deepEqual(violations, [], view + ' axe violations')
}
async function raster(page, char) {
  const result = await page.evaluate(async char => {
    const family = 'Babble Glyphs'
    const faces = await document.fonts.load(`112px "${family}"`, char)
    const sample = text => {
      const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 170
      const context = canvas.getContext('2d'); context.font = `112px "${family}", monospace`; context.fillStyle = '#ffffff'; context.fillText(text, 20, 130)
      const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data
      let pixels = 0
      for (let index = 3; index < bytes.length; index += 4) if (bytes[index]) pixels++
      return { pixels, image: canvas.toDataURL() }
    }
    const rendered = sample(char), missing = sample(String.fromCodePoint(0x10ffff))
    return { char, family, faceCount: faces.length, faceStates: faces.map(face => ({ family: face.family, status: face.status })), pixels: rendered.pixels, differsFromMissing: rendered.image !== missing.image }
  }, char)
  assert.ok(result.faceCount > 0, 'target must resolve a product font face')
  assert.ok(result.faceStates.every(face => face.status === 'loaded'))
  assert.ok(result.pixels > 40, 'target must produce visible strokes')
  assert.equal(result.differsFromMissing, true, 'target must differ from a missing-glyph raster')
  glyphs.push(result)
}
async function userCode(page, char) {
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '管理本机字库', exact: true }).click()
  await page.locator('.user-library-import input[type="file"]:not(:disabled)').waitFor()
  await page.getByLabel('选择字库文件', { exact: true }).setInputFiles({ name: 'qa-glyph.tsv', mimeType: 'text/plain', buffer: Buffer.from(`${char}\tabcd\n`) })
  await page.getByRole('button', { name: '应用用户字库', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.user-library-status')?.textContent.includes('已应用'))
  await page.keyboard.press('Escape'); await blur(page)
}

try {
  const page = await createPage()
  await check('ordinary first lesson does not fetch any rare-character font payload', async () => {
    await page.waitForLoadState('networkidle')
    assert.equal(requests.filter(request => isFont(request.url)).length, 0)
    assert.equal(await page.locator('.character-inspect-button').innerText(), '某')
  })
  await check('Extension B component target loads a pinned font and renders actual strokes', async () => {
    await importText(page, '𠁳'); await waitFont(page)
    await raster(page, '𠁳')
    assert.ok(requests.some(request => isFont(request.url) && /glyph-080-/.test(request.url)))
    await page.screenshot({ path: new URL('glyph-extension-b-desktop.png', output).pathname, fullPage: true })
    const start = requests.length
    await page.keyboard.type('okujfgfg')
    await page.waitForFunction(() => document.querySelector('.auxiliary-trainer')?.dataset.completed === 'true')
    assert.deepEqual(await states(page), Array(8).fill('correct'))
    assert.deepEqual(requests.slice(start), [], 'loaded glyph typing must not issue requests')
    await audit(page, 'glyph-extension-b')
  })
  await check('rare-character Inspector names retain the visible glyph and status with clear boundaries', async () => {
    await page.locator('.character-inspect-button').click()
    await page.locator('.component-spelling-results[data-status="ready"]').waitFor()
    await page.waitForFunction(() => !document.querySelector('.glyph-font-status[data-status="loading"]'))
    assert.equal(await page.getByRole('button', { name: '𠁳：重新选择读音', exact: true }).count(), 1)
    assert.equal(await page.locator('.inspector-results').getByRole('button', { name: '𠁳 未收录：查看读音与编码', exact: true }).count(), 1)
    await audit(page, 'glyph-extension-b-inspector')
    await page.keyboard.press('Escape'); await blur(page)
  })
  await check('rare glyph remains visible in 320px dark reduced-motion layout', async () => {
    await page.setViewportSize({ width: 320, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.getByRole('button', { name: '重置当前字', exact: true }).click()
    await raster(page, '𠁳')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: new URL('glyph-extension-b-320-dark.png', output).pathname, fullPage: true })
    await audit(page, 'glyph-320-dark')
  })
  await check('Unicode Extension J imported target renders from the product font without inferred readings', async () => {
    const unicode = await createPage(), char = String.fromCodePoint(0x323b0)
    await userCode(unicode, char); await importText(unicode, char); await waitFont(unicode)
    await raster(unicode, char)
    assert.match(await unicode.locator('.pinyin').innerText(), /不推断本字读音/)
    await unicode.screenshot({ path: new URL('glyph-extension-j-desktop.png', output).pathname, fullPage: true })
    await audit(unicode, 'glyph-extension-j')
  })
  await check('a real font request failure exposes retry and preserves accepted input in the same page', async () => {
    const retry = await createPage(), pattern = /glyph-080-[^/]+\.woff2(?:\?.*)?$/
    retry.__qaExpectedFontFault = true
    let failed = 0
    await retry.route(pattern, route => { failed++; return route.abort() })
    await importText(retry, '𠁳'); await waitFont(retry, 'error')
    assert.ok(failed > 0)
    await retry.keyboard.type('ok')
    assert.deepEqual((await states(retry)).slice(0, 3), ['correct', 'correct', 'hidden'])
    await audit(retry, 'glyph-load-error')
    await retry.unroute(pattern)
    await retry.locator('.character-stage > .glyph-font-status').getByRole('button', { name: '重试加载字形', exact: true }).click()
    await waitFont(retry); retry.__qaExpectedFontFault = false
    await raster(retry, '𠁳')
    assert.deepEqual((await states(retry)).slice(0, 3), ['correct', 'correct', 'hidden'])
    assert.equal(await retry.locator('.text-original').textContent(), '𠁳')
    await blur(retry); await retry.keyboard.type('ujfgfg')
    await retry.waitForFunction(() => document.querySelector('.auxiliary-trainer')?.dataset.completed === 'true')
  })
  await check('a new Unicode18 character absent from the pinned font reports its glyph boundary honestly', async () => {
    const missing = await createPage(), char = String.fromCodePoint(0x2b81e)
    await userCode(missing, char); const requestStart = requests.length
    await importText(missing, char); await waitFont(missing, 'unavailable')
    assert.ok((await missing.locator('.character-stage > .glyph-font-status[data-status="unavailable"]').innerText()).trim())
    assert.equal(requests.slice(requestStart).filter(request => isFont(request.url)).length, 0)
    assert.equal(await missing.locator('.auxiliary-trainer').getAttribute('data-scheme'), 'user-code')
    await audit(missing, 'glyph-source-boundary')
  })
  assert.deepEqual(errors, [], 'No unexpected browser errors')
  assert.equal(requests.some(request => request.method !== 'GET' || request.postData), false, 'No article or library uploads')
  passed.push('no unexpected browser errors or user-content uploads')
} catch (error) {
  failure = String(error?.stack ?? error)
  throw error
} finally {
  await writeFile(new URL('glyph-font-smoke.json', output), JSON.stringify({ baseURL, engine, browser: browser.version(), passed, failure, errors, faults, requests, glyphs }, null, 2) + '\n')
  await writeFile(new URL('glyph-font-accessibility.json', output), JSON.stringify(accessibility, null, 2) + '\n')
  for (const context of contexts) await context.close()
  await browser.close()
  console.log(`Glyph QA: ${passed.length} checks; ${accessibility.length} axe scans; ${failure ? 'FAILED' : 'PASS'}`)
}
