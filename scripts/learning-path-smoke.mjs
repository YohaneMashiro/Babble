// Browser-only QA; keep Playwright and axe outside application dependencies.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createQaBrowser } from './browser-qa.mjs'

const AxeBuilder = process.env.AXE_IMPORT ? (await import(process.env.AXE_IMPORT)).default : null
const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const { browser, engine, output } = await createQaBrowser()
const contexts = []
const passed = []
const accessibility = []
const errors = []
const requests = []
const screenshots = []
let failure = null

const lessonTitles = ['认识小鹤', '什么是双拼', '声母键位', '韵母键位', '完整双拼音节', '零声母音节', '什么是鹤形', '从首形开始', '找到末形', '字根与键位', '常用字 100', '常用字 300', '常用字 500', '常用字 1000', '扩展 3000 字']
const check = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
const states = page => page.locator('.code-slot').evaluateAll(elements => elements.map(element => element.getAttribute('data-state')))
const keys = page => page.locator('.slot-key').allTextContents()
const blur = page => page.evaluate(() => document.activeElement?.blur())
const currentChar = page => page.locator('.character-inspect-button').innerText()
const nav = page => page.getByRole('navigation', { name: '学习模式' })
const waitSaved = page => page.waitForFunction(() => document.querySelector('.storage-status')?.getAttribute('data-status') === 'saved')
const waitMemory = page => page.waitForFunction(() => document.querySelector('.storage-status')?.getAttribute('data-status') === 'memory-only')
const reset = async page => { await page.getByRole('button', { name: '重置当前字', exact: true }).click(); await blur(page) }
const openPath = async page => {
  if (!(await page.getByRole('dialog', { name: '学习路径', exact: true }).count())) await nav(page).getByRole('button', { name: '学习路径', exact: true }).click()
  await page.getByRole('dialog', { name: '学习路径', exact: true }).waitFor()
}
const selectLesson = async (page, index) => {
  await openPath(page)
  await page.locator('.path-lesson').nth(index).click()
  await page.locator('.lesson-context h2').filter({ hasText: lessonTitles[index] }).waitFor()
  await blur(page)
}
const dbRead = page => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('babble-learning-v1', 1)
  request.onerror = () => reject(request.error)
  request.onsuccess = () => {
    const database = request.result
    const tx = database.transaction(['state', 'attempts'], 'readonly')
    const state = tx.objectStore('state').get('snapshot')
    const attempts = tx.objectStore('attempts').getAll()
    tx.oncomplete = () => { const result = { snapshot: state.result, attempts: attempts.result }; database.close(); resolve(result) }
    tx.onerror = () => { database.close(); reject(tx.error) }
  }
}))
const capture = async (page, name) => {
  await page.screenshot({ path: new URL(name, output).pathname, fullPage: true })
  screenshots.push(name)
}
const audit = async (page, view) => {
  if (!AxeBuilder) return
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = result.violations.map(({ id, impact, description, nodes }) => ({ id, impact, description, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))
  accessibility.push({ view, violations })
  console.log(`AXE ${view}: ${violations.length} issue classes`)
}
async function createPage({ blocked = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  contexts.push(context)
  await context.addInitScript(({ blocked }) => {
    localStorage.setItem('babble:learning-level', 'yinxing')
    localStorage.setItem('xiaohe:auto-hints', 'false')
    if (blocked) IDBFactory.prototype.open = function () { throw new DOMException('Unavailable in QA', 'SecurityError') }
  }, { blocked })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => requests.push(request.url()))
  await page.goto(baseURL)
  await page.waitForLoadState('networkidle')
  if (blocked) await waitMemory(page)
  else await waitSaved(page)
  return page
}

try {
  const page = await createPage()
  await check('all fifteen lessons are freely selectable and the default recommendation matches experience', async () => {
    await openPath(page)
    assert.equal(await page.locator('.path-lesson').count(), 15)
    for (const button of await page.locator('.path-lesson').all()) assert.equal(await button.isEnabled(), true)
    assert.equal(await page.getByLabel('我目前的程度').inputValue(), 'shuangpin')
    assert.match(await page.locator('.path-lesson').filter({ has: page.locator('.path-recommendation') }).innerText(), /什么是鹤形/)
    await capture(page, 'phase4-path-picker.png')
    await audit(page, 'path-picker')
    for (let index = 0; index < lessonTitles.length; index++) {
      await selectLesson(page, index)
      assert.equal(await page.locator('.lesson-context h2').innerText(), lessonTitles[index])
    }
  })

  await check('experience and recommendation survive reload without restricting access', async () => {
    await openPath(page)
    await page.getByLabel('我目前的程度').selectOption('new')
    assert.match(await page.locator('.path-lesson').filter({ has: page.locator('.path-recommendation') }).innerText(), /认识小鹤/)
    await waitSaved(page)
    await page.reload()
    await waitSaved(page)
    await openPath(page)
    assert.equal(await page.getByLabel('我目前的程度').inputValue(), 'new')
    await page.getByLabel('我目前的程度').selectOption('yinxing')
    await waitSaved(page)
    await page.reload()
    await waitSaved(page)
    await openPath(page)
    assert.equal(await page.getByLabel('我目前的程度').inputValue(), 'yinxing')
    assert.match(await page.locator('.path-lesson').filter({ has: page.locator('.path-recommendation') }).innerText(), /常用字 300/)
    await page.getByLabel('我目前的程度').selectOption('shuangpin')
    await waitSaved(page)
  })

  await check('first-shape lesson practices only the real third position and provides the other keys', async () => {
    await selectLesson(page, 7)
    assert.equal(await currentChar(page), '某')
    assert.deepEqual(await states(page), ['revealed', 'revealed', 'hidden', 'revealed'])
    assert.deepEqual(await keys(page), ['M', 'Z', '·', 'M'])
    assert.equal(await page.locator('.code-slot.provided').count(), 3)
    assert.equal(await page.locator('.keyboard-key.target').count(), 0)
    await capture(page, 'phase4-first-shape.png')
    await audit(page, 'first-shape-lesson')
  })

  const requestStart = requests.length
  await check('two independent focused completions establish only focused mastery', async () => {
    await page.keyboard.type('g')
    assert.deepEqual(await states(page), ['revealed', 'revealed', 'correct', 'revealed'])
    assert.match(await page.locator('.feedback').innerText(), /本关目标完成/)
    await waitSaved(page)
    let data = await dbRead(page)
    let last = data.attempts.at(-1)
    assert.deepEqual(last.positions, [2])
    assert.equal(last.targetCode, 'G')
    assert.equal(last.code, 'G')
    assert.equal(last.correct, true)
    assert.equal(last.completed, true)
    assert.equal(last.assisted, false)
    assert.equal(last.hintLevelUsed, 0)
    assert.equal(data.snapshot.entries['某:MZGM:2'].bestIndependentStreak, 1)
    assert.equal(data.snapshot.entries['某:MZGM:0123'].bestIndependentStreak, 0)
    const count = data.attempts.length
    await page.keyboard.type('gmmm')
    await openPath(page)
    await page.keyboard.press('Escape')
    await waitSaved(page)
    assert.equal((await dbRead(page)).attempts.length, count)
    await reset(page)
    await page.keyboard.type('g')
    await waitSaved(page)
    data = await dbRead(page)
    assert.equal(data.attempts.length, count + 1)
    assert.equal(data.snapshot.entries['某:MZGM:2'].bestIndependentStreak, 2)
    assert.equal(data.snapshot.entries['某:MZGM:0123'].bestIndependentStreak, 0)
    assert.match(await page.locator('.lesson-current-progress').innerText(), /曾独立掌握 1/)
    await capture(page, 'phase4-focused-progress.png')
  })
  assert.deepEqual(requests.slice(requestStart), [], 'focused keypress and local progress must perform no network lookups')
  passed.push('focused keypress and IndexedDB progress cause no network requests')

  await check('wrong focused input keeps source position and preserves exact attempt metadata', async () => {
    await reset(page)
    await page.keyboard.type('j')
    assert.deepEqual(await states(page), ['revealed', 'revealed', 'incorrect', 'revealed'])
    assert.match(await page.locator('.feedback').innerText(), /第 3 码/)
    await page.keyboard.type('g')
    await waitSaved(page)
    const data = await dbRead(page)
    const last = data.attempts.at(-1)
    assert.equal(last.code, 'JG')
    assert.equal(last.targetCode, 'G')
    assert.equal(last.wrongPosition, 2)
    assert.equal(last.correct, false)
    assert.equal(last.completed, true)
    assert.equal(data.snapshot.entries['某:MZGM:2'].consecutiveIndependent, 0)
    assert.equal(data.snapshot.entries['某:MZGM:2'].bestIndependentStreak, 2)
  })

  await check('manual hints retain their peak after completing a focused target', async () => {
    await reset(page)
    for (let index = 0; index < 3; index++) await page.keyboard.press('Space')
    await page.keyboard.type('g')
    await waitSaved(page)
    const last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.hintLevelUsed, 3)
    assert.equal(last.assisted, true)
    assert.equal(last.correct, true)
  })

  await check('slot explanation, Inspector and teaching examples cannot count as independent', async () => {
    await reset(page)
    await page.locator('.code-slot').nth(2).click()
    await blur(page)
    await page.keyboard.type('g')
    await waitSaved(page)
    let last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.assisted, true)
    assert.equal(last.hintLevelUsed, 3)
    await reset(page)
    await page.locator('.character-inspect-button').click()
    await page.keyboard.type('g')
    assert.deepEqual(await states(page), ['revealed', 'revealed', 'hidden', 'revealed'])
    await page.keyboard.press('Escape')
    await page.keyboard.type('g')
    await waitSaved(page)
    last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.assisted, true)
    assert.equal(last.hintLevelUsed, 4)
    await reset(page)
    await page.locator('.lesson-context details summary').click()
    await blur(page)
    await page.keyboard.type('g')
    await waitSaved(page)
    last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.assisted, true)
    assert.equal(last.hintLevelUsed, 4)
    await reset(page)
    await page.keyboard.type('g')
    await waitSaved(page)
    last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.assisted, true, 'open examples remain assisted after reset')
    await page.locator('.lesson-context details summary').click()
  })

  await check('automatic hint assistance is recorded without timing failure', async () => {
    await page.locator('.hint-mode').click()
    assert.equal(await page.locator('.hint-mode').getAttribute('aria-pressed'), 'true')
    await reset(page)
    await page.bringToFront()
    await page.locator('.feedback-eyebrow').filter({ hasText: /第 3 码/ }).waitFor({ timeout: 10000 })
    await page.keyboard.type('g')
    await waitSaved(page)
    const last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.assisted, true)
    assert.equal(last.hintLevelUsed, 1)
    assert.equal(last.completed, true)
    await page.locator('.hint-mode').click()
  })

  await check('lesson cursor resumes the saved character after reload', async () => {
    await blur(page)
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '你')
    await waitSaved(page)
    const before = await dbRead(page)
    assert.equal(before.snapshot.lessons['first-shape'].lastEntryIndex, 1)
    await page.reload()
    await waitSaved(page)
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    await openPath(page)
    assert.match(await page.locator('.path-resume').innerText(), /从第 2/)
    await page.locator('.path-resume .primary-button').click()
    assert.equal(await currentChar(page), '你')
    assert.deepEqual(await states(page), ['revealed', 'revealed', 'hidden', 'revealed'])
    assert.match(await page.locator('.sample-label').innerText(), /2\s*\//)
  })

  await check('sound lesson keeps its partial prefix across an Inspector visit', async () => {
    await selectLesson(page, 1)
    assert.equal(await currentChar(page), '某')
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'revealed', 'revealed'])
    await page.keyboard.type('m')
    await page.locator('.character-inspect-button').click()
    await page.keyboard.press('Escape')
    assert.deepEqual(await states(page), ['correct', 'hidden', 'revealed', 'revealed'])
    await page.keyboard.type('z')
    await waitSaved(page)
    const last = (await dbRead(page)).attempts.at(-1)
    assert.deepEqual(last.positions, [0, 1])
    assert.equal(last.code, 'MZ')
    assert.equal(last.assisted, true)
    assert.equal(last.hintLevelUsed, 4)
  })

  await check('course round ending allows repetition and unrestricted course changes', async () => {
    await selectLesson(page, 0)
    const label = await page.locator('.sample-label').innerText()
    const [, current, total] = label.match(/(\d+)\s*\/\s*([\d,]+)/)
    for (let index = Number(current); index < Number(total.replaceAll(',', '')); index++) {
      await blur(page)
      await page.keyboard.press('Enter')
    }
    assert.equal(await currentChar(page), '好')
    await blur(page)
    // HCNZ is the audited shape-traces source code for 好, not an inferred code.
    await page.keyboard.type('h')
    const beforeEnd = (await dbRead(page)).attempts.length
    await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: '本轮练习已结束' }).waitFor()
    await waitSaved(page)
    let data = await dbRead(page)
    assert.equal(data.attempts.length, beforeEnd + 1)
    assert.equal(data.attempts.at(-1).char, '好')
    assert.equal(data.attempts.at(-1).code, 'H')
    assert.equal(data.attempts.at(-1).completed, false)
    await audit(page, 'lesson-round-ended')
    const before = await states(page)
    await page.keyboard.type('mzgm')
    assert.deepEqual(await states(page), before)
    await page.keyboard.press('Escape')
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    await blur(page)
    await page.keyboard.type('hcnz')
    await waitSaved(page)
    data = await dbRead(page)
    assert.equal(data.attempts.length, beforeEnd + 2)
    assert.equal(data.attempts.at(-1).code, 'HCNZ')
    assert.equal(data.attempts.at(-1).completed, true)
    await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: '本轮练习已结束' }).waitFor()
    await page.getByRole('button', { name: '再练一轮', exact: true }).click()
    assert.equal(await currentChar(page), '某')
    assert.match(await page.locator('.sample-label').innerText(), /1\s*\//)
    await openPath(page)
    assert.equal(await page.locator('.path-lesson').count(), 15)
    assert.equal(await page.locator('.path-lesson').nth(14).isEnabled(), true)
    await page.keyboard.press('Escape')
  })

  await check('returning to free learning restores four-code practice', async () => {
    await nav(page).getByRole('button', { name: '自由学习', exact: true }).click()
    await blur(page)
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    assert.equal(await page.locator('.code-slot.provided').count(), 0)
    await page.keyboard.type('mzgm')
    await waitSaved(page)
    assert.deepEqual(await states(page), ['correct', 'correct', 'correct', 'correct'])
    const data = await dbRead(page)
    assert.equal(data.snapshot.entries['某:MZGM:0123'].bestIndependentStreak, 1)
  })

  await check('rapid completion and reset writes retain every independent attempt in order', async () => {
    const before = await dbRead(page)
    const count = before.attempts.length
    await page.evaluate(() => document.activeElement?.blur())
    for (let round = 0; round < 2; round++) {
      await page.keyboard.press('Backspace')
      await page.keyboard.type('mzgm')
    }
    await waitSaved(page)
    const data = await dbRead(page)
    assert.equal(data.attempts.length, count + 2)
    assert.deepEqual(data.attempts.slice(-2).map(attempt => attempt.code), ['MZGM', 'MZGM'])
    assert.equal(data.snapshot.entries['某:MZGM:0123'].consecutiveIndependent, 3)
  })

  await check('mobile path picker and focused lessons fit 375px and 320px', async () => {
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 })
      await openPath(page)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await capture(page, `phase4-path-mobile-${width}.png`)
      await audit(page, `path-mobile-${width}`)
      await page.locator('.path-lesson').nth(7).click()
      await blur(page)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await capture(page, `phase4-focused-mobile-${width}.png`)
      await audit(page, `focused-mobile-${width}`)
    }
  })

  await check('dark path picker and focus lesson preserve contrast and reduced motion', async () => {
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await openPath(page)
    await capture(page, 'phase4-path-dark.png')
    await audit(page, 'path-dark')
    await page.locator('.path-lesson').nth(7).click()
    await capture(page, 'phase4-focused-dark.png')
    await audit(page, 'focused-dark')
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
  })

  await check('unavailable IndexedDB falls back to working in-memory practice', async () => {
    const blockedPage = await createPage({ blocked: true })
    await blur(blockedPage)
    await blockedPage.keyboard.type('mzgm')
    assert.deepEqual(await states(blockedPage), ['correct', 'correct', 'correct', 'correct'])
    assert.match(await blockedPage.locator('.storage-status').textContent(), /内存/)
    await blockedPage.setViewportSize({ width: 375, height: 812 })
    assert.equal(await blockedPage.locator('.local-record-note').isVisible(), true)
    await audit(blockedPage, 'memory-only-mobile')
    await openPath(blockedPage)
    await blockedPage.locator('.path-lesson').nth(7).click()
    await blur(blockedPage)
    await blockedPage.keyboard.type('g')
    assert.match(await blockedPage.locator('.lesson-current-progress').innerText(), /已尝试 1/)
  })

  await check('corrupt saved snapshot remains untouched while memory practice continues', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
    contexts.push(context)
    await context.addInitScript(() => { localStorage.setItem('babble:learning-level', 'yinxing'); localStorage.setItem('xiaohe:auto-hints', 'false') })
    const corruptPage = await context.newPage()
    corruptPage.on('pageerror', error => errors.push(error.message))
    corruptPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await corruptPage.route('**/qa-seed', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>seed</title>' }))
    await corruptPage.goto(new URL('qa-seed', baseURL).href)
    await corruptPage.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('babble-learning-v1', 1)
      request.onupgradeneeded = () => { request.result.createObjectStore('state'); request.result.createObjectStore('attempts', { autoIncrement: true }) }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const tx = database.transaction('state', 'readwrite')
        tx.objectStore('state').put({ version: 999, preserve: 'do not overwrite' }, 'snapshot')
        tx.oncomplete = () => { database.close(); resolve() }
        tx.onerror = () => { database.close(); reject(tx.error) }
      }
    }))
    await corruptPage.goto(baseURL)
    await waitMemory(corruptPage)
    await blur(corruptPage)
    await corruptPage.keyboard.type('mzgm')
    assert.deepEqual(await states(corruptPage), ['correct', 'correct', 'correct', 'correct'])
    const data = await dbRead(corruptPage)
    assert.deepEqual(data.snapshot, { version: 999, preserve: 'do not overwrite' })
    assert.equal(data.attempts.length, 0)
  })

  assert.deepEqual(errors, [], 'no browser console or page errors')
  passed.push('no browser console or page errors')
  assert.deepEqual(accessibility.flatMap(view => view.violations.map(item => `${view.view}: ${item.id}`)), [], 'axe scans must be clean')
} catch (error) {
  failure = String(error?.stack ?? error)
  throw error
} finally {
  await writeFile(new URL('learning-path-smoke.json', output), JSON.stringify({ baseURL, engine, browser: await browser.version(), passed, failure, errors, screenshots }, null, 2) + '\n')
  await writeFile(new URL('learning-path-accessibility.json', output), JSON.stringify(accessibility, null, 2) + '\n')
  for (const context of contexts) await context.close()
  await browser.close()
  console.log(`Learning-path QA: ${passed.length} checks; ${accessibility.length} axe scans; ${failure ? 'FAILED' : 'PASS'}`)
}
