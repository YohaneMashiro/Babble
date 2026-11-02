// Run against the dev or preview server. Keep Playwright outside product dependencies:
// PLAYWRIGHT_IMPORT=file:///tmp/xiaohe-browser-qa/node_modules/playwright/index.mjs node scripts/browser-smoke.mjs
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createQaBrowser } from './browser-qa.mjs'

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const { browser, engine, output } = await createQaBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
// Disable the optional idle hint timer so interaction checks are deterministic.
await context.addInitScript(() => { localStorage.setItem('babble:learning-level', 'yinxing'); localStorage.setItem('xiaohe:auto-hints', 'false') })
const page = await context.newPage()
const consoleErrors = []
const requests = []
const passed = []
const inputPreconditions = []
const accessibilityReports = []
const AxeBuilder = process.env.AXE_IMPORT ? (await import(process.env.AXE_IMPORT)).default : null
page.on('pageerror', error => consoleErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('request', request => requests.push(request.url()))

const slots = () => page.locator('.code-slot')
const states = () => slots().evaluateAll(elements => elements.map(element => element.getAttribute('data-state')))
const keys = () => page.locator('.slot-key').allTextContents()
const feedback = () => page.locator('.feedback').innerText()
const blur = () => page.evaluate(() => document.activeElement?.blur())
const reset = async () => { await page.getByRole('button', { name: '重置当前字', exact: true }).click(); await blur() }
const check = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
const audit = async view => {
  if (!AxeBuilder) return
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = result.violations.map(({ id, impact, description, nodes }) => ({
    id, impact, description,
    nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  }))
  accessibilityReports.push({ view, violations })
  // axe creates a helper page; return actual keyboard focus to the page under test.
  await page.bringToFront()
  console.log(`AXE ${view}: ${violations.length} issue classes`)
}

try {
  await page.goto(baseURL)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => document.querySelector('.storage-status')?.dataset.status === 'saved')
  await check('initial answer is hidden', async () => {
    assert.deepEqual(await states(), ['hidden', 'hidden', 'hidden', 'hidden'])
    assert.deepEqual(await keys(), ['·', '·', '·', '·'])
    assert.equal(await page.locator('.keyboard-key.target, .keyboard-key.context-key').count(), 0)
    assert.equal(await page.getByRole('button', { name: '某：查看取形与来源', exact: true }).count(), 1)
    assert.match(await page.title(), /^Babble: A better place to learn Xiaohe$/)
  })
  await page.screenshot({ path: new URL('desktop-initial.png', output).pathname, fullPage: true })
  await audit('desktop-initial')

  const inputRequestIndex = requests.length
  await check('physical M Z J keeps two correct codes and marks only third wrong', async () => {
    await page.bringToFront()
    await page.locator('#practice').focus()
    const prerequisite = await page.evaluate(() => ({ storage: document.querySelector('.storage-status')?.dataset.status, focused: document.hasFocus(), activeId: document.activeElement?.id }))
    inputPreconditions.push(prerequisite)
    assert.equal(prerequisite.storage, 'saved')
    assert.equal(prerequisite.focused, true)
    assert.equal(prerequisite.activeId, 'practice')
    await page.keyboard.type('mzj')
    assert.deepEqual(await states(), ['correct', 'correct', 'incorrect', 'hidden'])
    assert.deepEqual(await keys(), ['M', 'Z', 'J', '·'])
    assert.match(await feedback(), /甘/)
    assert.match(await feedback(), /G/)
  })
  await page.screenshot({ path: new URL('desktop-wrong-third.png', output).pathname, fullPage: true })
  await check('correct G M completes without losing earlier codes', async () => {
    await page.keyboard.type('gm')
    assert.deepEqual(await states(), ['correct', 'correct', 'correct', 'correct'])
    assert.deepEqual(await keys(), ['M', 'Z', 'G', 'M'])
    assert.match(await feedback(), /四码完成/)
  })
  assert.deepEqual(requests.slice(inputRequestIndex), [], 'keypress must not request network resources')
  passed.push('keypress performs no network requests')
  await audit('desktop-completed')

  await check('Space progressively reveals four hint levels', async () => {
    await reset()
    await page.keyboard.press('Space')
    assert.deepEqual(await keys(), ['·', '·', '·', '·'])
    assert.match(await feedback(), /先想一想/)
    await page.keyboard.press('Space')
    assert.deepEqual(await keys(), ['·', '·', '·', '·'])
    assert.match(await feedback(), /声母是 m/)
    await page.keyboard.press('Space')
    assert.deepEqual(await keys(), ['M', '·', '·', '·'])
    assert.equal(await page.locator('.keyboard-key.target').count(), 1)
    await page.keyboard.press('Space')
    assert.deepEqual(await keys(), ['M', 'Z', 'G', 'M'])
    assert.match(await feedback(), /完整解释/)
    assert.deepEqual(await states(), ['revealed', 'revealed', 'revealed', 'revealed'])
  })
  await audit('desktop-full-hints')

  await check('each clicked slot explains its own component and key', async () => {
    await reset()
    for (const [index, value, key] of [[0, 'm', 'M'], [1, 'ou', 'Z'], [2, '甘', 'G'], [3, '木', 'M']]) {
      await slots().nth(index).click()
      assert.equal(await page.locator('.feedback p > strong').innerText(), value)
      assert.equal(await page.locator('.feedback p > kbd').innerText(), key)
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.code-slot.selected').count(), 0)
    }
    assert.deepEqual(await states(), ['hidden', 'hidden', 'hidden', 'hidden'])
  })

  await check('virtual key input and key inspector work', async () => {
    await page.getByRole('button', { name: '输入 M', exact: true }).click()
    assert.deepEqual(await states(), ['correct', 'hidden', 'hidden', 'hidden'])
    await page.getByRole('button', { name: '查看 M 键含义', exact: true }).click()
    assert.match(await page.locator('.key-inspector').innerText(), /声母 m/)
    const before = await states()
    await page.keyboard.type('z')
    assert.deepEqual(await states(), before)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.key-inspector').count(), 0)
    await page.keyboard.type('z')
    assert.deepEqual(await states(), ['correct', 'correct', 'hidden', 'hidden'])
  })

  await check('native settings dialog blocks input and Escape preserves training', async () => {
    const before = await states()
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    assert.equal(await page.getByRole('dialog', { name: '学习设置' }).count(), 1)
    assert.equal(await page.locator('dialog').evaluate(element => element.open && element.contains(document.activeElement)), true)
    await audit('settings-dialog')
    await page.keyboard.type('m')
    assert.deepEqual(await states(), before)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('dialog').count(), 0)
    assert.deepEqual(await states(), before)
    await page.keyboard.type('gm')
    assert.deepEqual(await states(), ['correct', 'correct', 'correct', 'correct'])
  })

  await check('modifiers, repeat and IME composition do not enter letters', async () => {
    await reset()
    for (const shortcut of ['Control+m', 'Alt+m', 'Meta+m']) await page.keyboard.press(shortcut)
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', repeat: true, bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', isComposing: true, bubbles: true }))
    })
    assert.deepEqual(await states(), ['hidden', 'hidden', 'hidden', 'hidden'])
  })

  await check('uppercase physical letters are accepted', async () => {
    await page.keyboard.type('MZGM')
    assert.deepEqual(await states(), ['correct', 'correct', 'correct', 'correct'])
  })

  await check('focused hint button Space activates only once', async () => {
    await reset()
    await page.getByRole('button', { name: /给我一点提示/ }).focus()
    await page.keyboard.press('Space')
    assert.deepEqual(await keys(), ['·', '·', '·', '·'])
    assert.match(await feedback(), /先想一想/)
  })

  await check('Inspector preserves partial input and shows source-backed shape paths', async () => {
    await reset()
    await page.keyboard.type('mz')
    await page.locator('.character-inspect-button').click()
    const before = await states()
    const search = page.getByRole('textbox', { name: '汉字、拼音或编码' })
    await search.fill('你')
    await page.getByRole('heading', { name: '你的读音与编码' }).waitFor()
    assert.match(await page.locator('.inspector-shape').innerText(), /你 → 尔 → 小/)
    assert.match(await page.locator('.inspector-code-summary').innerText(), /NIRX/)
    await page.screenshot({ path: new URL('inspector-ni.png', output).pathname, fullPage: true })
    await audit('inspector-ni')
    await page.locator('.inspector-sources summary').click()
    assert.match(await page.locator('.inspector-sources').innerText(), /AGPL-3.0/)
    assert.match(await page.locator('.inspector-sources').innerText(), /Unicode-3.0/)
    assert.deepEqual(await states(), before)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('dialog').count(), 0)
    assert.deepEqual(await states(), ['correct', 'correct', 'hidden', 'hidden'])
  })

  await check('expanded common characters expose verified codes, root explanations and their own provenance', async () => {
    await page.getByRole('button', { name: '查字与编码', exact: true }).click()
    const search = page.getByRole('textbox', { name: '汉字、拼音或编码' })
    for (const [char, code] of [['我', 'WOPD'], ['中', 'VSLL'], ['木', 'MUUN'], ['水', 'UVLN'], ['花', 'HXCB']]) {
      await search.fill(char)
      await page.getByRole('heading', { name: `${char}的读音与编码` }).waitFor()
      const choice = page.locator('.inspector-reading-choices button').filter({ hasText: code }).first()
      await choice.click()
      assert.match(await page.locator('.inspector-code-summary').innerText(), new RegExp(code))
      assert.match(await page.locator('.inspector-shape').innerText(), /首形.*末形/)
      if (!(await page.locator('.inspector-sources').evaluate(element => element.open))) await page.locator('.inspector-sources > summary').click()
      assert.match(await page.locator('.inspector-sources').innerText(), /Babble 开源拆字与笔顺取形/)
    }
    await page.screenshot({ path: new URL('expanded-character-inspector.png', output).pathname, fullPage: true })
    await audit('expanded-character-inspector')
    await page.keyboard.press('Escape')
  })

  await check('Inspector refuses missing shapes and handles unknown or empty queries', async () => {
    await page.getByRole('button', { name: '查字与编码', exact: true }).click()
    const search = page.getByRole('textbox', { name: '汉字、拼音或编码' })
    // These single-stroke characters remain pronunciation-only in both audited
    // input layers; former fixtures can now have compared component spellings.
    for (const char of ['丨', '丶']) {
      await search.fill(char)
      await page.getByRole('heading', { name: `${char}的读音与编码` }).waitFor()
      assert.match(await page.locator('.inspector-detail').innerText(), /取形数据尚未收录/)
      assert.equal(await page.locator('.inspector-train').count(), 0)
    }
    await search.fill('🦩')
    await page.getByRole('heading', { name: '🦩的读音与编码' }).waitFor()
    assert.match(await page.locator('.inspector-detail').innerText(), /未找到/)
    await page.screenshot({ path: new URL('inspector-missing.png', output).pathname, fullPage: true })
    await audit('inspector-missing')
    await search.fill('')
    assert.match(await page.locator('.inspector-result-count').innerText(), /输入内容/)
    await search.fill('zzzzzzzzzz')
    assert.match(await page.locator('.inspector-result-count').innerText(), /没有匹配/)
    await page.keyboard.press('Escape')
  })

  await check('local search accepts multiple characters, toned pinyin and full codes', async () => {
    await page.getByRole('button', { name: '查字与编码', exact: true }).click()
    const search = page.getByRole('textbox', { name: '汉字、拼音或编码' })
    await search.fill('学习')
    assert.equal(await page.locator('.inspector-results button').count(), 2)
    for (const query of ['mou', 'mǒu', 'MZGM']) {
      await search.fill(query)
      assert.equal(await page.locator('.inspector-results button').filter({ hasText: '某' }).count(), 1)
    }
    await page.keyboard.press('Escape')
  })

  await check('polyphonic reading is explicitly selected before training', async () => {
    await page.getByRole('button', { name: '查字与编码', exact: true }).click()
    const search = page.getByRole('textbox', { name: '汉字、拼音或编码' })
    await search.fill('行')
    await page.getByRole('heading', { name: '行的读音与编码' }).waitFor()
    assert.equal(await page.locator('.inspector-train').count(), 0)
    assert.match(await page.locator('.inspector-choice-prompt').innerText(), /请选择/)
    await audit('inspector-polyphonic')
    await page.getByRole('button', { name: 'háng HHII', exact: true }).click()
    assert.match(await page.locator('.inspector-code-summary').innerText(), /HHII/)
    await page.locator('.inspector-train').click()
    assert.equal(await page.locator('dialog').count(), 0)
    assert.equal(await page.locator('.character-inspect-button').innerText(), '行')
    assert.equal(await page.locator('.pinyin').innerText(), 'háng')
    await page.keyboard.type('hhii')
    assert.deepEqual(await states(), ['correct', 'correct', 'correct', 'correct'])
  })

  await check('Enter and skip advance the shared training engine', async () => {
    const before = await page.locator('.character-inspect-button').innerText()
    await blur()
    await page.keyboard.press('Enter')
    assert.notEqual(await page.locator('.character-inspect-button').innerText(), before)
    assert.deepEqual(await states(), ['hidden', 'hidden', 'hidden', 'hidden'])
    const second = await page.locator('.character-inspect-button').innerText()
    await page.getByRole('button', { name: /跳过此字/ }).click()
    assert.notEqual(await page.locator('.character-inspect-button').innerText(), second)
    assert.deepEqual(await states(), ['hidden', 'hidden', 'hidden', 'hidden'])
  })

  await check('key mapping separates current meaning from global associations', async () => {
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '查看 M 键含义', exact: true }).click()
    assert.match(await page.locator('.key-inspector').innerText(), /声母 m.*末形 木/)
    await page.locator('.key-all-mappings > summary').click()
    assert.match(await page.locator('.key-all-mappings').innerText(), /韵母：ian/)
    assert.match(await page.locator('.key-all-mappings').innerText(), /尚不代表全部/)
    await page.keyboard.press('Escape')
  })

  await check('source archive and notices are accessible in the production build', async () => {
    await page.getByRole('button', { name: /数据与开源/ }).click()
    const path = await page.locator('.source-download').getAttribute('href')
    const response = await page.request.get(new URL(path, baseURL).href)
    assert.equal(response.status(), 200)
    const bytes = await response.body()
    assert.equal(bytes[0], 0x1f)
    assert.equal(bytes[1], 0x8b)
    const notice = await page.request.get(new URL('licenses/NOTICE-Unicode.txt', baseURL).href)
    assert.equal(notice.status(), 200)
    assert.match(await notice.text(), /Unicode/)
    await audit('data-and-source')
    await page.keyboard.press('Escape')
  })

  await check('375px mobile layout has no horizontal overflow', async () => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.screenshot({ path: new URL('mobile-initial.png', output).pathname, fullPage: true })
    await audit('mobile-375')
    await page.getByRole('button', { name: '输入 M', exact: true }).click()
    assert.deepEqual(await states(), ['correct', 'hidden', 'hidden', 'hidden'])
    await page.getByRole('button', { name: '查字与编码', exact: true }).click()
    await page.getByRole('textbox', { name: '汉字、拼音或编码' }).fill('你')
    await page.screenshot({ path: new URL('mobile-inspector.png', output).pathname, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await audit('mobile-inspector')
    await page.keyboard.press('Escape')
  })

  await check('320px layout has no horizontal overflow', async () => {
    await page.setViewportSize({ width: 320, height: 812 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.screenshot({ path: new URL('mobile-320.png', output).pathname, fullPage: true })
  })

  await check('dark theme and reduced-motion preferences apply', async () => {
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme.includes('dark')), true)
    assert.equal(await page.locator('.keyboard-key').first().evaluate(element => getComputedStyle(element).transitionDuration), '0s')
    await page.screenshot({ path: new URL('desktop-dark.png', output).pathname, fullPage: true })
    await audit('desktop-dark')
    await page.getByRole('button', { name: '查字与编码', exact: true }).click()
    await page.getByRole('textbox', { name: '汉字、拼音或编码' }).fill('你')
    await audit('inspector-dark')
    await page.keyboard.press('Escape')
  })

  await check('fresh browser defaults to automatic hints without revealing answers', async () => {
    const freshContext = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
    await freshContext.addInitScript(() => localStorage.setItem('babble:learning-level', 'yinxing'))
    const freshPage = await freshContext.newPage()
    await freshPage.goto(baseURL)
    await freshPage.waitForLoadState('networkidle')
    assert.equal(await freshPage.locator('.hint-mode').getAttribute('aria-pressed'), 'true')
    assert.deepEqual(await freshPage.locator('.slot-key').allTextContents(), ['·', '·', '·', '·'])
    await freshPage.screenshot({ path: new URL('desktop-default.png', output).pathname, fullPage: true })
    await freshContext.close()
  })

  assert.deepEqual(consoleErrors, [], 'browser console must contain no errors')
  passed.push('no browser console or page errors')
  const report = { baseURL, engine, browser: await browser.version(), passed, consoleErrors, inputPreconditions, screenshots: ['desktop-default.png', 'desktop-initial.png', 'desktop-wrong-third.png', 'inspector-ni.png', 'inspector-missing.png', 'mobile-initial.png', 'mobile-inspector.png', 'mobile-320.png', 'desktop-dark.png'] }
  await writeFile(new URL('browser-smoke.json', output), JSON.stringify(report, null, 2) + '\n')
  if (AxeBuilder) {
    await writeFile(new URL('accessibility.json', output), JSON.stringify(accessibilityReports, null, 2) + '\n')
    assert.deepEqual(accessibilityReports.flatMap(({ view, violations }) => violations.map(({ id }) => `${view}: ${id}`)), [], 'axe accessibility audit must pass')
  }
  console.log(`Browser smoke: ${passed.length} checks passed; screenshots and report in test-results/`)
} catch (error) {
  await writeFile(new URL('browser-smoke.json', output), JSON.stringify({ baseURL, engine, browser: await browser.version(), passed, failure: error instanceof Error ? error.message : String(error), consoleErrors, inputPreconditions }, null, 2) + '\n')
  await writeFile(new URL('accessibility.json', output), JSON.stringify(accessibilityReports, null, 2) + '\n')
  throw error
} finally {
  await browser.close()
}
