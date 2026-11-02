// Browser regression for the two learning levels. Playwright/axe stay outside product dependencies.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createQaBrowser } from './browser-qa.mjs'

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const { browser, engine, output } = await createQaBrowser()
const AxeBuilder = process.env.AXE_IMPORT ? (await import(process.env.AXE_IMPORT)).default : null
const contexts = [], passed = [], accessibility = [], errors = [], screenshots = []
let failure = null
const check = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
const levelButton = (page, level) => page.getByRole('button', { name: level === 'shuangpin' ? /小鹤双拼/ : /小鹤音形/ })
const nav = page => page.getByRole('navigation', { name: '学习模式' })
const slots = page => page.locator('.code-slot')
const states = page => slots(page).evaluateAll(elements => elements.map(element => element.dataset.state))
const currentChar = page => page.locator('.character-inspect-button').innerText()
const editor = page => page.getByRole('dialog', { name: '自定义文本', exact: true })
const waitReady = page => page.waitForFunction(() => ['saved', 'memory-only'].includes(document.querySelector('.storage-status')?.dataset.status))
const waitSaved = page => page.waitForFunction(() => document.querySelector('.storage-status')?.dataset.status === 'saved')
const focusPractice = async page => { await page.bringToFront(); await page.locator('#practice').focus(); assert.equal(await page.evaluate(() => document.hasFocus()), true) }
const assertSoundOnly = async (page, area = page.locator('main')) => {
  assert.doesNotMatch(await area.innerText(), /取形|首形|末形|四码|拼字|双形|字根/)
  assert.equal(await page.locator('.auxiliary-trainer, .inspector-extra-codes, .shape-teaching').count(), 0)
}
const switchLevel = async (page, level) => {
  await levelButton(page, level).click()
  await waitReady(page)
  await page.waitForFunction(count => document.querySelectorAll('.code-slot').length === count, level === 'shuangpin' ? 2 : 4)
  assert.equal(await levelButton(page, level).getAttribute('aria-pressed'), 'true')
}
async function createPage({ initialLevel, blockedStorage = false, invalidLevel = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  contexts.push(context)
  await context.addInitScript(({ initialLevel, blockedStorage, invalidLevel }) => {
    localStorage.setItem('xiaohe:auto-hints', 'false')
    if (initialLevel) localStorage.setItem('babble:learning-level', initialLevel)
    if (invalidLevel) localStorage.setItem('babble:learning-level', 'corrupt-level')
    if (blockedStorage) {
      Storage.prototype.getItem = function () { throw new DOMException('Storage unavailable in QA', 'SecurityError') }
      Storage.prototype.setItem = function () { throw new DOMException('Storage unavailable in QA', 'QuotaExceededError') }
      IDBFactory.prototype.open = function () { throw new DOMException('Database unavailable in QA', 'SecurityError') }
    }
  }, { initialLevel, blockedStorage, invalidLevel })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.__levelRequests = []
  page.on('request', r => page.__levelRequests.push(r.url()))
  await page.goto(baseURL)
  await waitReady(page)
  await page.waitForLoadState('networkidle')
  return page
}
async function audit(page, view) {
  if (!AxeBuilder) return
  await page.waitForTimeout(200) // Wait for the existing 160ms color transitions.
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))
  accessibility.push({ view, violations })
  assert.equal(violations.length, 0, `${view}: axe violations`)
  console.log(`AXE ${view}: 0`)
}
async function capture(page, name) {
  await page.screenshot({ path: new URL(name, output).pathname, fullPage: true })
  screenshots.push(name)
}
async function reset(page) {
  await page.getByRole('button', { name: '重置当前字', exact: true }).click()
  await focusPractice(page)
}
async function openEditor(page) {
  if (await editor(page).count()) return
  if (await page.locator('.text-context').count()) await page.getByRole('button', { name: '编辑文本', exact: true }).click()
  else await nav(page).getByRole('button', { name: '自定义文本', exact: true }).click()
  await editor(page).waitFor()
}
async function importText(page, text) {
  await openEditor(page)
  await page.getByLabel('练习文本', { exact: true }).fill(text)
  await editor(page).locator('button[type="submit"]:not(:disabled)').waitFor()
  await editor(page).locator('button[type="submit"]').click()
  await editor(page).waitFor({ state: 'hidden' })
  await page.locator('.text-context').waitFor()
  await focusPractice(page)
}
async function readProgress(page) {
  await waitSaved(page)
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('babble-learning-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['state', 'attempts'], 'readonly')
      const snapshot = tx.objectStore('state').get('snapshot'), attempts = tx.objectStore('attempts').getAll()
      tx.oncomplete = () => { db.close(); resolve({ snapshot: snapshot.result, attempts: attempts.result }) }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  }))
}

try {
  const page = await createPage()
  await check('fresh browser opens Xiaohe shuangpin with exactly two hidden sound slots', async () => {
    assert.equal(await levelButton(page, 'shuangpin').getAttribute('aria-pressed'), 'true')
    assert.equal(await levelButton(page, 'yinxing').getAttribute('aria-pressed'), 'false')
    assert.equal(await currentChar(page), '某')
    assert.deepEqual(await states(page), ['hidden', 'hidden'])
    assert.equal(await page.locator('.keyboard-views').count(), 0)
    await assertSoundOnly(page)
    await capture(page, 'learning-level-shuangpin-desktop.png')
    await audit(page, 'shuangpin-initial')
  })
  await check('two correct sound keys finish and save a genuine two-key target without network requests', async () => {
    const before = page.__levelRequests.length
    await focusPractice(page)
    await page.keyboard.type('mz')
    assert.deepEqual(await states(page), ['correct', 'correct'])
    assert.match(await page.locator('.feedback').innerText(), /完成/)
    const data = await readProgress(page), attempt = data.attempts.at(-1)
    assert.equal(attempt.fullCode, 'MZ')
    assert.equal(attempt.targetCode, 'MZ')
    assert.deepEqual(attempt.positions, [0, 1])
    assert.equal(attempt.correct, true)
    assert.equal(attempt.assisted, false)
    assert.deepEqual(page.__levelRequests.slice(before), [])
  })
  await check('all hint layers and inspected mappings remain limited to sounds', async () => {
    await reset(page)
    for (let i = 0; i < 4; i++) await page.keyboard.press('Space')
    assert.deepEqual(await page.locator('.full-explanation > span').count(), 2)
    await assertSoundOnly(page)
    await page.getByRole('button', { name: '查看 G 键含义', exact: true }).click()
    await page.getByText('查看此键已收录的映射', { exact: true }).click()
    await assertSoundOnly(page)
    await audit(page, 'shuangpin-key-mapping')
    await page.getByRole('button', { name: '收起键位说明', exact: true }).click()
  })
  await check('shuangpin settings and data explanation expose only the selected level', async () => {
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '管理本机字库', exact: true }).count(), 0)
    await assertSoundOnly(page, page.getByRole('dialog'))
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /数据与开源/ }).click()
    await assertSoundOnly(page, page.getByRole('dialog'))
    await page.keyboard.press('Escape')
  })
  await check('shuangpin courses contain no shape lessons and train sound-only targets', async () => {
    await nav(page).getByRole('button', { name: '学习路径', exact: true }).click()
    const path = page.getByRole('dialog', { name: '学习路径', exact: true })
    assert.ok(await page.locator('.path-lesson').count() >= 4)
    await assertSoundOnly(page, path)
    assert.equal(await page.getByLabel('我目前的程度').count(), 0)
    await audit(page, 'shuangpin-path')
    const lessonCount = await page.locator('.path-lesson').count()
    for (let i = 0; i < lessonCount; i++) {
      if (!(await path.count())) await nav(page).getByRole('button', { name: '学习路径', exact: true }).click()
      await page.locator('.path-lesson').nth(i).click()
      assert.equal(await slots(page).count(), 2)
      await assertSoundOnly(page)
    }
    await nav(page).getByRole('button', { name: '自由学习', exact: true }).click()
  })
  await check('dictionary allows reading-backed 无 without requiring a four-key source', async () => {
    await page.getByRole('button', { name: /查字与/ }).click()
    const inspector = page.getByRole('dialog')
    await page.locator('.inspector-search input').fill('无')
    await page.locator('.inspector-reading-choices button').filter({ hasText: 'wú' }).click()
    assert.equal(await page.locator('.inspector-slots li').count(), 2)
    assert.match(await page.locator('.inspector-code-summary').innerText(), /WU/)
    await assertSoundOnly(page, inspector)
    await audit(page, 'shuangpin-inspector-reading-only')
    await inspector.getByRole('button', { name: /^练习双拼「无」/ }).click()
    await inspector.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.querySelector('.character-inspect-button')?.textContent === '无')
    assert.equal(await currentChar(page), '无')
    await focusPractice(page)
    await page.keyboard.type('wu')
    assert.deepEqual(await states(page), ['correct', 'correct'])
  })
  await check('mixed text keeps literals, allows sourced readings and requires per-occurrence polyphone selection', async () => {
    const text = '无安行行某\nEnglish remains 2026.\n'
    await importText(page, text)
    assert.equal(await page.locator('.text-original').textContent(), text)
    assert.equal(await page.locator('.text-character[data-target-index]').count(), 5)
    assert.equal(await currentChar(page), '无')
    await page.locator('.text-reading-options button').filter({ hasText: 'wú' }).click()
    await focusPractice(page)
    await page.keyboard.type('wu')
    assert.deepEqual(await states(page), ['correct', 'correct'])
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '安')
    await page.keyboard.type('an')
    assert.deepEqual(await states(page), ['correct', 'correct'])
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '行')
    assert.equal(await slots(page).count(), 0, 'ambiguous occurrence must wait for an explicit choice')
    await page.locator('.text-reading-options button').filter({ hasText: 'xíng' }).click()
    await focusPractice(page)
    await page.keyboard.type('xk')
    assert.deepEqual(await states(page), ['correct', 'correct'])
    await page.keyboard.press('Enter')
    assert.equal(await slots(page).count(), 0, 'the second occurrence has its own choice')
    await page.locator('.text-reading-options button').filter({ hasText: 'háng' }).click()
    await focusPractice(page)
    await page.keyboard.type('hh')
    assert.deepEqual(await states(page), ['correct', 'correct'])
    await assertSoundOnly(page)
    await audit(page, 'shuangpin-text')
  })
  await check('UTF-8 TXT upload works in shuangpin and retains English and line breaks', async () => {
    const text = '安某\nHello Babble! 2026\n'
    await openEditor(page)
    await page.getByLabel('上传 TXT 文件', { exact: true }).setInputFiles({ name: 'levels.TXT', mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') })
    await page.waitForFunction(value => document.querySelector('.text-editor textarea')?.value === value, text)
    await editor(page).locator('button[type="submit"]:not(:disabled)').waitFor()
    await assertSoundOnly(page, editor(page))
    await editor(page).locator('button[type="submit"]').click()
    assert.equal(await page.locator('.text-original').textContent(), text)
    assert.equal(await currentChar(page), '安')
    await focusPractice(page); await page.keyboard.type('an')
    assert.deepEqual(await states(page), ['correct', 'correct'])
    // Vite dev eagerly imports tiny ?url modules; those contain only asset URLs.
    // Count actual dictionary payloads, as in the production asset contract.
    const payloadRequests = page.__levelRequests.filter(url => /component-spelling-[^/]+\.(?:json|js)(?:\?|$)/.test(url) && !new URL(url).searchParams.has('url'))
    assert.equal(payloadRequests.length, 0, 'sound-only exercises must not load component-spelling payloads')
  })
  await check('switching to yinxing restores original four-key exercise and persists after reload', async () => {
    await switchLevel(page, 'yinxing')
    assert.equal(await currentChar(page), '某')
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    assert.equal(await page.locator('.character-caption').count(), 0)
    assert.equal(await page.evaluate(() => localStorage.getItem('babble:learning-level')), 'yinxing')
    await page.reload(); await waitSaved(page)
    assert.equal(await levelButton(page, 'yinxing').getAttribute('aria-pressed'), 'true')
    assert.equal(await slots(page).count(), 4)
    await capture(page, 'learning-level-yinxing-desktop.png')
    await audit(page, 'yinxing-restored')
  })
  await check('original four-key progress survives sound-level attempts without changing its mastery', async () => {
    await focusPractice(page); await page.keyboard.type('mzgm')
    await reset(page); await page.keyboard.type('mzgm')
    const before = await readProgress(page)
    const oldKey = '某:MZGM:0123', soundKey = '某:MZ:01'
    assert.equal(before.snapshot.entries[oldKey].bestIndependentStreak, 2)
    await switchLevel(page, 'shuangpin')
    await focusPractice(page); await page.keyboard.type('mz')
    await reset(page); await page.keyboard.type('mz')
    const after = await readProgress(page)
    assert.deepEqual(after.snapshot.entries[oldKey], before.snapshot.entries[oldKey])
    assert.equal(after.snapshot.entries[soundKey].bestIndependentStreak, 2)
    await page.reload(); await waitSaved(page)
    assert.equal(await levelButton(page, 'shuangpin').getAttribute('aria-pressed'), 'true')
    assert.equal(await slots(page).count(), 2)
    const restored = await readProgress(page)
    assert.deepEqual(restored.snapshot.entries[oldKey], before.snapshot.entries[oldKey])
    assert.equal(restored.snapshot.entries[soundKey].bestIndependentStreak, 2)
  })
  await check('level changes preserve separate text positions and the session-only user library', async () => {
    const local = await createPage({ initialLevel: 'yinxing' })
    await local.getByRole('button', { name: '打开设置', exact: true }).click()
    await local.getByRole('button', { name: '管理本机字库', exact: true }).click()
    await local.locator('.user-library-import input[type="file"]:not(:disabled)').waitFor()
    await local.getByLabel('选择字库文件', { exact: true }).setInputFiles({ name: 'level-memory.tsv', mimeType: 'text/plain', buffer: Buffer.from('𠀂\taaaa\n', 'utf8') })
    await local.getByRole('button', { name: '应用用户字库', exact: true }).waitFor()
    assert.equal(await local.getByLabel('保存在当前浏览器', { exact: true }).isChecked(), false)
    await local.getByRole('button', { name: '应用用户字库', exact: true }).click()
    await local.waitForFunction(() => document.querySelector('.user-library-status')?.textContent.includes('已应用'))
    await local.keyboard.press('Escape')
    await importText(local, '𠀂某')
    await local.locator('.auxiliary-trainer').waitFor()
    await local.locator('.text-character[data-target-index="1"]').click()
    await switchLevel(local, 'shuangpin')
    await importText(local, '安某')
    await local.locator('.text-character[data-target-index="1"]').click()
    await switchLevel(local, 'yinxing')
    await nav(local).getByRole('button', { name: '自定义文本', exact: true }).click()
    assert.equal(await local.locator('.text-original').textContent(), '𠀂某')
    assert.equal(await currentChar(local), '某')
    assert.equal(await local.locator('.text-character[aria-current="location"]').getAttribute('data-target-index'), '1')
    await local.locator('.text-character[data-target-index="0"]').click()
    await local.locator('.auxiliary-trainer').waitFor()
    assert.equal(await currentChar(local), '𠀂')
    await local.getByRole('button', { name: '打开设置', exact: true }).click()
    await local.getByRole('button', { name: '管理本机字库', exact: true }).click()
    assert.match(await local.locator('.user-library-current').innerText(), /1 条.*level-memory/)
    await local.keyboard.press('Escape')
    await switchLevel(local, 'shuangpin')
    await nav(local).getByRole('button', { name: '自定义文本', exact: true }).click()
    assert.equal(await local.locator('.text-original').textContent(), '安某')
    assert.equal(await currentChar(local), '某')
    assert.equal(await local.locator('.text-character[aria-current="location"]').getAttribute('data-target-index'), '1')
    await assertSoundOnly(local)
  })
  await check('320px and 375px screens keep both levels reachable without horizontal overflow', async () => {
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 900 })
      for (const level of ['shuangpin', 'yinxing']) {
        await switchLevel(page, level)
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
        assert.ok(size.scroll <= size.client + 1, `${level} at ${width}px overflows ${JSON.stringify(size)}`)
        assert.equal(await levelButton(page, level).isVisible(), true)
        await capture(page, `learning-level-${level}-${width}.png`)
        await audit(page, `${level}-${width}`)
      }
    }
  })
  await check('invalid saved level safely defaults to shuangpin', async () => {
    const invalid = await createPage({ invalidLevel: true })
    assert.equal(await levelButton(invalid, 'shuangpin').getAttribute('aria-pressed'), 'true')
    assert.equal(await slots(invalid).count(), 2)
  })
  await check('denied localStorage and IndexedDB still allow both learning levels in memory', async () => {
    const blocked = await createPage({ blockedStorage: true })
    assert.equal(await levelButton(blocked, 'shuangpin').getAttribute('aria-pressed'), 'true')
    assert.equal(await blocked.locator('.storage-status').getAttribute('data-status'), 'memory-only')
    await focusPractice(blocked); await blocked.keyboard.type('mz')
    assert.deepEqual(await states(blocked), ['correct', 'correct'])
    await switchLevel(blocked, 'yinxing')
    await focusPractice(blocked); await blocked.keyboard.type('mzgm')
    assert.deepEqual(await states(blocked), ['correct', 'correct', 'correct', 'correct'])
    await switchLevel(blocked, 'shuangpin')
    await assertSoundOnly(blocked)
    await audit(blocked, 'storage-denied')
  })
  assert.deepEqual(errors, [], 'browser must not emit uncaught errors')
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack }
  throw error
} finally {
  await writeFile(new URL('learning-level-smoke.json', output), JSON.stringify({ engine, browserVersion: browser.version(), baseURL, passed, accessibility, errors, screenshots, failure }, null, 2))
  await Promise.all(contexts.map(context => context.close()))
  await browser.close()
}
