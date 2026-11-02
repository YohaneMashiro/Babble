// Continuous-text regression. Playwright and axe stay outside product dependencies.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createQaBrowser } from './browser-qa.mjs'

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const { browser, engine, output } = await createQaBrowser()
const AxeBuilder = process.env.AXE_IMPORT ? (await import(process.env.AXE_IMPORT)).default : null
const contexts = [], passed = [], accessibility = [], errors = [], screenshots = []
let failure = null
const check = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
const nav = page => page.getByRole('navigation', { name: '学习模式' })
const editor = page => page.getByRole('dialog', { name: '自定义文本', exact: true })
const current = page => page.locator('.text-character[aria-current="location"]')
const currentChar = page => current(page).innerText()
const states = page => page.locator('.code-slot').evaluateAll(els => els.map(el => el.dataset.state))
const auxStates = page => page.locator('.auxiliary-code-slot').evaluateAll(els => els.map(el => el.dataset.state))
const waitReady = page => page.waitForFunction(() => ['saved', 'memory-only'].includes(document.querySelector('.storage-status')?.dataset.status))
const waitSaved = page => page.waitForFunction(() => document.querySelector('.storage-status')?.dataset.status === 'saved')
const focusPractice = async page => { await page.bringToFront(); await page.locator('#practice').focus(); assert.equal(await page.evaluate(() => document.hasFocus()), true) }
const waitIndex = (page, index) => page.waitForFunction(value => document.querySelector('.text-character[aria-current="location"]')?.dataset.targetIndex === String(value), index)
const waitAux = async page => {
  await page.waitForFunction(() => ['saved', 'memory-only'].includes(document.querySelector('.auxiliary-storage')?.dataset.status))
  await page.waitForFunction(() => !document.querySelector('.glyph-font-status[data-status="loading"]'))
}
async function createPage(level = 'shuangpin') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  contexts.push(context)
  await context.addInitScript(level => { localStorage.setItem('babble:learning-level', level); localStorage.setItem('xiaohe:auto-hints', 'false') }, level)
  const page = await context.newPage()
  page.__requests = []
  page.on('request', request => page.__requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(baseURL); await waitReady(page); await page.waitForLoadState('networkidle')
  return page
}
async function importText(page, text) {
  if (!(await editor(page).count())) {
    if (await page.locator('.text-context').count()) await page.getByRole('button', { name: '编辑文本', exact: true }).click()
    else await nav(page).getByRole('button', { name: '自定义文本', exact: true }).click()
  }
  await editor(page).waitFor()
  await page.getByLabel('练习文本', { exact: true }).fill(text)
  await editor(page).locator('button[type="submit"]:not(:disabled)').waitFor()
  await editor(page).locator('button[type="submit"]').click()
  await editor(page).waitFor({ state: 'hidden' }); await waitIndex(page, 0); await focusPractice(page)
}
async function readStore(page, name, store) {
  return page.evaluate(({ name, store }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(store, 'readonly'), rows = tx.objectStore(store).getAll()
      tx.oncomplete = () => { db.close(); resolve(rows.result) }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  }), { name, store })
}
async function audit(page, view) {
  if (!AxeBuilder) return
  await page.waitForTimeout(200)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))
  accessibility.push({ view, violations }); assert.equal(violations.length, 0, `${view}: axe violations`)
  console.log(`AXE ${view}: 0`); await page.bringToFront()
}
async function capture(page, name) { await page.screenshot({ path: new URL(name, output).pathname, fullPage: true }); screenshots.push(name) }
async function applyLibrary(page, text) {
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '管理本机字库', exact: true }).click()
  await page.locator('.user-library-import input[type="file"]:not(:disabled)').waitFor()
  await page.getByLabel('选择字库文件', { exact: true }).setInputFiles({ name: 'text-flow.tsv', mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') })
  await page.getByRole('button', { name: '应用用户字库', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.user-library-status')?.textContent.includes('已应用'))
  await page.keyboard.press('Escape')
}

try {
  const sound = await createPage()
  await check('continuous original receives the large reading area and the current character becomes a compact reference', async () => {
    await importText(sound, '某某某\nEnglish remains 2026.\n')
    const box = await sound.locator('.text-original').boundingBox()
    assert.ok(box.width >= 900, `desktop text width: ${box.width}`)
    assert.ok(box.height >= 250, `desktop text height: ${box.height}`)
    assert.equal(await sound.locator('.character-stage h1').count(), 0)
    for (const button of await sound.locator('.character-stage .character-inspect-button').all()) assert.ok(await button.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) <= 24)
    assert.equal(await sound.getByRole('region', { name: '练习原文', exact: true }).count(), 1)
    assert.equal(await sound.getByRole('region', { name: '练习原文', exact: true }).textContent(), '某某某\nEnglish remains 2026.\n')
    assert.equal(await sound.locator('.keyboard-section').count(), 1)
    await capture(sound, 'text-flow-shuangpin-desktop.png'); await audit(sound, 'sound-large-text')
  })
  await check('two-key completion waits for Space, commits once, advances once and does not scroll or request data', async () => {
    await focusPractice(sound); await sound.evaluate(() => window.scrollTo(0, 0))
    const requestStart = sound.__requests.length
    await sound.keyboard.type('mz'); assert.deepEqual(await states(sound), ['correct', 'correct'])
    assert.equal(await current(sound).getAttribute('data-target-index'), '0')
    const beforeScroll = await sound.evaluate(() => scrollY)
    await sound.keyboard.press('Space'); await waitIndex(sound, 1)
    assert.deepEqual(await states(sound), ['hidden', 'hidden'])
    assert.equal(await sound.evaluate(() => scrollY), beforeScroll)
    await waitSaved(sound)
    const attempts = await readStore(sound, 'babble-learning-v1', 'attempts')
    assert.equal(attempts.length, 1); assert.equal(attempts[0].code, 'MZ'); assert.equal(attempts[0].completed, true); assert.equal(attempts[0].assisted, false)
    assert.deepEqual(sound.__requests.slice(requestStart), [])
  })
  await check('partial and untouched targets skip on Space, and the final Space finishes the article', async () => {
    await sound.keyboard.type('m'); await sound.keyboard.press('Space'); await waitIndex(sound, 2)
    await waitSaved(sound)
    const attempts = await readStore(sound, 'babble-learning-v1', 'attempts')
    assert.equal(attempts.length, 2); assert.equal(attempts.at(-1).code, 'M'); assert.equal(attempts.at(-1).completed, false)
    await sound.keyboard.press('Space'); await sound.getByRole('dialog', { name: '本轮文本已结束', exact: true }).waitFor()
    await waitSaved(sound); assert.equal((await readStore(sound, 'babble-learning-v1', 'attempts')).length, 2)
    await sound.keyboard.press('Escape')
  })
  await check('virtual Space and native hint buttons have distinct actions without double advancement', async () => {
    await importText(sound, '某某某')
    const hint = sound.locator('.stage-actions button').filter({ hasText: /提示/ }).first()
    await hint.focus(); await sound.keyboard.press('Space')
    await sound.waitForFunction(() => document.querySelector('.code-slot')?.dataset.state === 'hinted')
    await waitIndex(sound, 0); assert.equal(await current(sound).getAttribute('data-target-index'), '0')
    assert.equal(await sound.locator('.feedback').innerText().then(text => /从读音开始/.test(text)), false)
    await sound.locator('.space-key').click(); await waitIndex(sound, 1)
    await sound.locator('.space-key').focus(); await sound.keyboard.press('Space'); await waitIndex(sound, 2)
    assert.equal(await current(sound).getAttribute('data-target-index'), '2')
    assert.match(await sound.locator('.shortcut-guide').innerText(), /Space.*下一字|Space.*确认/)
  })
  await check('repeat, modifier and composition Space do not advance and editor Space remains literal', async () => {
    await importText(sound, '某某')
    await focusPractice(sound)
    await sound.evaluate(() => { for (const options of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, ...options })) })
    assert.equal(await current(sound).getAttribute('data-target-index'), '0')
    await sound.getByRole('button', { name: '编辑文本', exact: true }).click()
    await sound.getByLabel('练习文本', { exact: true }).fill('某某')
    await sound.getByLabel('练习文本', { exact: true }).press('End'); await sound.keyboard.press('Space')
    assert.equal(await sound.getByLabel('练习文本', { exact: true }).inputValue(), '某某 ')
    assert.equal(await current(sound).getAttribute('data-target-index'), '0')
    await sound.getByRole('button', { name: '取消', exact: true }).click()
  })
  await check('unselected polyphonic occurrences can skip with Space without inventing an attempt', async () => {
    await importText(sound, '行某')
    assert.equal(await sound.locator('.code-slot').count(), 0)
    await waitSaved(sound); const count = (await readStore(sound, 'babble-learning-v1', 'attempts')).length
    await focusPractice(sound); await sound.keyboard.press('Space'); await waitIndex(sound, 1)
    assert.equal(await currentChar(sound), '某'); assert.equal((await readStore(sound, 'babble-learning-v1', 'attempts')).length, count)
  })
  const shape = await createPage('yinxing')
  await check('free and course modes retain Space hints while text uses a four-key commit', async () => {
    await focusPractice(shape); await shape.keyboard.press('Space')
    assert.equal(await shape.locator('.character-inspect-button').innerText(), '某')
    assert.equal((await states(shape))[0], 'hinted')
    await nav(shape).getByRole('button', { name: '学习路径', exact: true }).click()
    await shape.locator('.path-lesson').filter({ hasText: '声母键位' }).first().click()
    const before = await shape.locator('.character-inspect-button').innerText()
    await focusPractice(shape); await shape.keyboard.press('Space')
    assert.equal(await shape.locator('.character-inspect-button').innerText(), before)
    assert.ok((await states(shape)).includes('hinted'))
    await importText(shape, '某某'); await shape.keyboard.type('mzgm')
    assert.deepEqual(await states(shape), Array(4).fill('correct')); await shape.keyboard.press('Space'); await waitIndex(shape, 1)
    assert.deepEqual(await states(shape), Array(4).fill('hidden')); await audit(shape, 'shape-four-key-space')
  })
  await check('completed compact slots retain visible-label accessible names for 走 and polyphonic 行', async () => {
    await importText(shape, '走行某'); await shape.keyboard.type('zztr')
    assert.deepEqual(await states(shape), Array(4).fill('correct'))
    await audit(shape, 'compact-zou-completed')
    await focusPractice(shape); await shape.keyboard.press('Space'); await waitIndex(shape, 1)
    await shape.locator('.text-reading-options button').filter({ hasText: 'háng' }).click()
    await focusPractice(shape); await shape.keyboard.type('hhii')
    assert.deepEqual(await states(shape), Array(4).fill('correct'))
    await audit(shape, 'compact-hang-completed')
  })
  await check('lookup-only chosen readings skip on Space without a fabricated four-code attempt', async () => {
    await importText(shape, '洗某')
    await shape.locator('.text-reading-options button').filter({ hasText: 'xiǎn' }).click()
    assert.equal(await shape.locator('.code-slot').count(), 0)
    await waitSaved(shape); const count = (await readStore(shape, 'babble-learning-v1', 'attempts')).length
    await focusPractice(shape); await shape.keyboard.type('xide'); await shape.keyboard.press('Space'); await waitIndex(shape, 1)
    assert.equal((await readStore(shape, 'babble-learning-v1', 'attempts')).length, count)
  })
  await check('six-key and eight-key component targets use the same Space flow with independent records', async () => {
    const spelling = await createPage('yinxing')
    await importText(spelling, '𠀂𠁳某'); await waitAux(spelling); await focusPractice(spelling)
    assert.equal(await spelling.locator('.auxiliary-trainer').getAttribute('data-scheme'), 'component-spelling')
    assert.equal(await spelling.locator('.auxiliary-keyboard').count(), 1)
    await spelling.keyboard.type('okhgyi'); assert.deepEqual(await auxStates(spelling), Array(6).fill('correct'))
    assert.equal(await current(spelling).getAttribute('data-target-index'), '0')
    await spelling.keyboard.press('Space'); await waitIndex(spelling, 1); await waitAux(spelling); await focusPractice(spelling)
    assert.deepEqual(await auxStates(spelling), Array(8).fill('hidden'))
    await spelling.keyboard.type('okujfgfg'); assert.deepEqual(await auxStates(spelling), Array(8).fill('correct'))
    await spelling.keyboard.press('Space'); await waitIndex(spelling, 2); await waitAuxRecord(spelling, 2)
    const attempts = await readStore(spelling, 'babble-auxiliary-learning-v1', 'attempts')
    assert.deepEqual(attempts.map(a => a.typed), ['OKHGYI', 'OKUJFGFG']); assert.ok(attempts.every(a => a.completed && a.independent))
    assert.equal((await readStore(spelling, 'babble-learning-v1', 'attempts')).length, 0)
    await audit(spelling, 'component-space-to-four-key')
  })
  await check('the final auxiliary target restarts its save guard after partial Space completion is dismissed', async () => {
    const final = await createPage('yinxing')
    await importText(final, '𠀂'); await waitAux(final); await focusPractice(final)
    await final.keyboard.type('okh'); await final.keyboard.press('Space')
    await final.getByRole('dialog', { name: '本轮文本已结束', exact: true }).waitFor()
    await waitAuxRecord(final, 1)
    await final.keyboard.press('Escape'); await waitAux(final)
    assert.deepEqual(await auxStates(final), Array(6).fill('hidden'))
    await focusPractice(final); await final.keyboard.type('okhgyi'); await waitAuxRecord(final, 2)
    const attempts = await readStore(final, 'babble-auxiliary-learning-v1', 'attempts')
    assert.equal(attempts.length, 2)
    assert.equal(attempts[0].typed, 'OKH'); assert.equal(attempts[0].completed, false)
    assert.equal(attempts[1].typed, 'OKHGYI'); assert.equal(attempts[1].completed, true); assert.equal(attempts[1].independent, true)
  })
  await check('temporary user codes retain completed and partial Space semantics in their own namespace', async () => {
    const local = await createPage('yinxing')
    await applyLibrary(local, '𠀂\taaaa\n𠁳\tokabcdef\n')
    await importText(local, '𠀂𠁳某'); await waitAux(local); await focusPractice(local)
    assert.equal(await local.locator('.auxiliary-trainer').getAttribute('data-scheme'), 'user-code')
    await local.keyboard.type('aaaa'); await local.keyboard.press('Space'); await waitIndex(local, 1); await waitAux(local); await focusPractice(local)
    await local.keyboard.type('okab'); await local.keyboard.press('Space'); await waitIndex(local, 2); await waitAuxRecord(local, 2)
    const attempts = await readStore(local, 'babble-auxiliary-learning-v1', 'attempts')
    assert.equal(attempts[0].completed, true); assert.equal(attempts[0].typed, 'AAAA')
    assert.equal(attempts[1].completed, false); assert.equal(attempts[1].typed, 'OKAB')
    assert.ok(attempts.every(a => a.kind === 'user-code'))
  })
  await check('Space crosses the 400-target page boundary and preserves the current text highlight', async () => {
    await importText(sound, '某'.repeat(402))
    await sound.locator('.text-character[data-target-index="399"]').click(); await focusPractice(sound)
    await sound.keyboard.press('Space'); await waitIndex(sound, 400)
    assert.equal(await sound.getByLabel('原文页码', { exact: true }).inputValue(), '1')
    assert.equal(await sound.locator('.text-original').textContent(), '某某')
  })
  await check('desktop, mobile and dark text layouts keep the enlarged article and keyboard usable', async () => {
    await importText(sound, '某安某\nContinuous text 2026.\n')
    for (const width of [375, 320]) {
      await sound.setViewportSize({ width, height: 900 })
      const box = await sound.locator('.text-original').boundingBox(); assert.ok(box.height >= 180)
      const size = await sound.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      assert.ok(size.scroll <= size.client, `${width}px overflow`)
      await capture(sound, `text-flow-${width}.png`); await audit(sound, `text-mobile-${width}`)
    }
    await sound.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await capture(sound, 'text-flow-dark.png'); await audit(sound, 'text-dark')
    await sound.setViewportSize({ width: 1440, height: 1050 }); await sound.emulateMedia({ colorScheme: 'light' })
    await sound.getByRole('button', { name: '编辑文本', exact: true }).click()
    const box = await sound.getByLabel('练习文本', { exact: true }).boundingBox(); assert.ok(box.height >= 250, `editor height ${box.height}`)
    await audit(sound, 'text-large-editor')
  })
  assert.deepEqual(errors, [])
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack }; console.error(error)
} finally {
  await writeFile(new URL('text-flow-smoke.json', output), `${JSON.stringify({ engine, browserVersion: await browser.version(), baseURL, passed, accessibility, errors, screenshots, failure }, null, 2)}\n`)
  for (const context of contexts) await context.close()
  await browser.close()
}
if (failure) process.exitCode = 1

async function waitAuxRecord(page, count) {
  await page.waitForFunction(expected => new Promise((resolve, reject) => {
    const request = indexedDB.open('babble-auxiliary-learning-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('attempts', 'readonly'), rows = tx.objectStore('attempts').getAll()
      tx.oncomplete = () => { db.close(); resolve(rows.result.length >= expected) }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  }), count)
}
