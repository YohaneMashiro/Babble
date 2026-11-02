// Browser regression for audited code-only records, component spelling and local libraries.
// Playwright and axe stay outside product dependencies; use browser-qa.mjs environment settings.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createQaBrowser } from './browser-qa.mjs'

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const { browser, engine, output } = await createQaBrowser()
const AxeBuilder = process.env.AXE_IMPORT ? (await import(process.env.AXE_IMPORT)).default : null
const contexts = [], passed = [], accessibility = [], errors = [], intentionalNetworkFailures = [], requests = []
let failure = null
const check = async (name, run) => { await run(); passed.push(name); console.log('PASS ' + name) }
const blur = page => page.evaluate(() => document.activeElement?.blur())
const nav = page => page.getByRole('navigation', { name: '学习模式' })
const editor = page => page.getByRole('dialog', { name: '自定义文本', exact: true })
const aux = page => page.locator('.auxiliary-trainer')
const auxStates = page => page.locator('.auxiliary-code-slot').evaluateAll(els => els.map(el => el.getAttribute('data-state')))
const mainStates = page => page.locator('.code-slot').evaluateAll(els => els.map(el => el.getAttribute('data-state')))
const currentChar = page => page.locator('.character-inspect-button').innerText()
const waitMain = page => page.waitForFunction(() => document.querySelector('.storage-status')?.dataset.status === 'saved')
const waitAux = async (page, status = 'saved') => {
  await page.waitForFunction(value => document.querySelector('.auxiliary-storage')?.dataset.status === value, status)
  // A new rare target may need its one-time glyph asset. Set the later
  // per-key network boundary only after that target's rendering is settled.
  await page.waitForFunction(() => !document.querySelector('.glyph-font-status[data-status="loading"]'))
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}
const waitAuxComplete = page => page.waitForFunction(() => document.querySelector('.auxiliary-trainer')?.dataset.completed === 'true' && document.querySelector('.auxiliary-storage')?.dataset.status !== 'loading')
const isComponentAsset = url => /component-spelling-[^/]+\.(?:json|js)(?:\?|$)/.test(url)

async function createPage(init) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  contexts.push(context)
  await context.addInitScript(() => { localStorage.setItem('babble:learning-level', 'yinxing'); localStorage.setItem('xiaohe:auto-hints', 'false') })
  if (init) await context.addInitScript(init)
  const page = await context.newPage()
  page.__qaExpectedFault = false
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => {
    if (m.type() !== 'error') return
    if (page.__qaExpectedFault && /Failed to load resource|NS_ERROR|Load failed|NetworkError/i.test(m.text())) intentionalNetworkFailures.push(m.text())
    else errors.push(m.text())
  })
  page.on('request', r => requests.push({ url: r.url(), method: r.method(), postData: r.postData() }))
  await page.goto(baseURL)
  await waitMain(page)
  return page
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
  await editor(page).locator('button[type="submit"]').click()
  await page.locator('.text-context').waitFor()
  await blur(page)
}
async function readDatabase(page, name, stores) {
  return page.evaluate(({ name, stores }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Expected existing QA database')) }
    request.onsuccess = () => {
      const db = request.result
      try {
        const tx = db.transaction(stores, 'readonly'), reads = Object.fromEntries(stores.map(store => [store, tx.objectStore(store).getAll()]))
        tx.oncomplete = () => { resolve(Object.fromEntries(Object.entries(reads).map(([store, req]) => [store, req.result]))); db.close() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      } catch (e) { db.close(); reject(e) }
    }
  }), { name, stores })
}
const readAux = page => readDatabase(page, 'babble-auxiliary-learning-v1', ['targets', 'attempts'])
const readMain = page => readDatabase(page, 'babble-learning-v1', ['state', 'attempts'])
const readUser = page => readDatabase(page, 'babble-user-library-v1', ['libraries'])
async function audit(page, view) {
  if (!AxeBuilder) return
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))
  accessibility.push({ view, violations })
  assert.equal(violations.length, 0, view + ' axe violations')
  console.log('AXE ' + view + ': ' + violations.length)
}
async function screenshot(page, name) { await page.screenshot({ path: new URL(name, output).pathname, fullPage: true }) }
async function openLibrary(page) {
  if (!(await page.getByRole('dialog', { name: '本机字库', exact: true }).count())) {
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    await page.getByRole('button', { name: '管理本机字库', exact: true }).click()
  }
  await page.getByLabel('选择字库文件', { exact: true }).waitFor()
  await page.getByLabel('选择字库文件', { exact: true }).waitFor({ state: 'visible' })
  // setInputFiles can dispatch into a disabled input. A user must first wait
  // for the initial local-store check to enable its native file picker.
  await page.locator('.user-library-import input[type="file"]:not(:disabled)').waitFor()
}
async function chooseLibrary(page, name, content) {
  await openLibrary(page)
  await page.getByLabel('选择字库文件', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8') })
}
async function applyLibrary(page, name, content, persist = false) {
  await chooseLibrary(page, name, content)
  await page.getByRole('button', { name: '应用用户字库', exact: true }).waitFor()
  assert.equal(await page.getByLabel('保存在当前浏览器', { exact: true }).isChecked(), false)
  if (persist) await page.getByLabel('保存在当前浏览器', { exact: true }).check()
  await page.getByRole('button', { name: '应用用户字库', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.user-library-status')?.textContent.includes('已应用'))
}
async function closeLibrary(page) { await page.keyboard.press('Escape'); await blur(page) }

try {
  const page = await createPage()
  await check('free four-code lesson keeps its answer hidden and does not request spelling payloads', async () => {
    await page.waitForLoadState('networkidle')
    assert.deepEqual(await mainStates(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    assert.equal(await aux(page).count(), 0)
    assert.equal(requests.filter(r => isComponentAsset(r.url)).length, 0)
  })
  await check('new published code-only character trains without fabricating roots', async () => {
    await importText(page, '走平')
    assert.equal(await currentChar(page), '走')
    await page.locator('.code-slot').nth(2).click()
    assert.match(await page.locator('.feedback').innerText(), /待补/)
    assert.equal(await page.locator('.shape-teaching-parts').count(), 0)
    await page.keyboard.press('Escape'); await blur(page)
    await page.keyboard.type('zztr')
    assert.deepEqual(await mainStates(page), ['correct', 'correct', 'correct', 'correct'])
    await waitMain(page)
    await audit(page, 'code-only-completed')
  })
  await check('curated 平 exposes evidenced endpoints and completes its independently derived code', async () => {
    await blur(page); await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '平')
    await page.locator('.code-slot').nth(2).click()
    assert.match(await page.locator('.feedback').innerText(), /一/)
    await page.keyboard.press('Escape'); await blur(page)
    await page.keyboard.type('pkau')
    assert.deepEqual(await mainStates(page), ['correct', 'correct', 'correct', 'correct'])
    await waitMain(page)
  })

  const spelling = await createPage()
  await check('text falls back to six-key spelling without inventing a character pronunciation', async () => {
    await importText(spelling, '𠀂𠀂𠁳')
    await aux(spelling).waitFor(); await waitAux(spelling)
    assert.equal(await aux(spelling).getAttribute('data-scheme'), 'component-spelling')
    assert.equal(await currentChar(spelling), '𠀂')
    assert.match(await spelling.locator('.pinyin').innerText(), /本字读音未收录/)
    assert.deepEqual(await auxStates(spelling), Array(6).fill('hidden'))
    assert.equal(await spelling.locator('.code-slot').count(), 0)
    await audit(spelling, 'six-key-hidden')
  })
  await check('wrong spelling key preserves the accepted prefix and all six positions remain usable', async () => {
    const requestStart = requests.length
    await spelling.keyboard.type('oj')
    assert.deepEqual((await auxStates(spelling)).slice(0, 3), ['correct', 'incorrect', 'hidden'])
    assert.match(await spelling.locator('.auxiliary-feedback').innerText(), /第 2 键.*K/)
    await spelling.keyboard.type('khgyi'); await waitAuxComplete(spelling)
    assert.deepEqual(await auxStates(spelling), Array(6).fill('correct'))
    const last = (await readAux(spelling)).attempts.at(-1)
    assert.equal(last.code, 'OKHGYI'); assert.equal(last.completed, true); assert.equal(last.independent, false)
    assert.deepEqual(requests.slice(requestStart), [])
    await audit(spelling, 'six-key-corrected')
  })
  await check('repeated occurrences reset transient state while retaining the same mastery target', async () => {
    const key = await aux(spelling).getAttribute('data-target-key')
    await blur(spelling); await spelling.keyboard.press('Enter')
    await spelling.waitForFunction(() => document.querySelector('.auxiliary-trainer')?.dataset.completed === 'false')
    await waitAux(spelling)
    assert.equal(await aux(spelling).getAttribute('data-target-key'), key)
    assert.deepEqual(await auxStates(spelling), Array(6).fill('hidden'))
    assert.match(await spelling.locator('.sample-label').innerText(), /2\s*\/\s*3/)
    await spelling.keyboard.type('okhgyi'); await waitAuxComplete(spelling)
    const record = (await readAux(spelling)).targets.find(r => r.key === key)
    assert.equal(record.streak, 1)
  })
  await check('three-component spelling accepts eight keys with no truncation or per-key requests', async () => {
    await blur(spelling); await spelling.keyboard.press('Enter'); await waitAux(spelling)
    assert.equal(await currentChar(spelling), '𠁳')
    assert.deepEqual(await auxStates(spelling), Array(8).fill('hidden'))
    const requestStart = requests.length
    await spelling.keyboard.type('okujfgfg'); await waitAuxComplete(spelling)
    assert.deepEqual(await auxStates(spelling), Array(8).fill('correct'))
    const last = (await readAux(spelling)).attempts.at(-1)
    assert.equal(last.code, 'OKUJFGFG')
    assert.deepEqual(requests.slice(requestStart), [])
    assert.equal((await readMain(spelling)).attempts.length, 0, 'component practice must not write four-code attempts')
    await screenshot(spelling, 'coverage-eight-key.png'); await audit(spelling, 'eight-key-completed')
  })
  await check('two fresh independent spellings establish mastery only in their own namespace', async () => {
    await importText(spelling, '𠀂𠀂')
    for (let index = 0; index < 2; index++) {
      await waitAux(spelling); await blur(spelling)
      await spelling.keyboard.type('okhgyi'); await waitAuxComplete(spelling)
      if (!index) { await spelling.keyboard.press('Enter'); await spelling.waitForFunction(() => document.querySelector('.auxiliary-trainer')?.dataset.completed === 'false') }
    }
    const key = await aux(spelling).getAttribute('data-target-key'), record = (await readAux(spelling)).targets.find(r => r.key === key)
    assert.ok(record.streak >= 2); assert.equal(record.everMastered, true)
    assert.ok(key.startsWith('component-spelling:'))
    assert.equal((await readMain(spelling)).attempts.length, 0)
  })
  await check('visible source disclosure cannot survive reset and become an independent result', async () => {
    await spelling.getByRole('button', { name: '重置当前字', exact: true }).click()
    await spelling.locator('.auxiliary-source > summary').click()
    assert.equal(await spelling.locator('.auxiliary-source').evaluate(el => el.open), true)
    await spelling.getByRole('button', { name: '重置当前字', exact: true }).click()
    assert.equal(await spelling.locator('.auxiliary-source').evaluate(el => el.open), false, 'reset closes the disclosed source')
    await spelling.locator('.auxiliary-source > summary').click()
    await blur(spelling); await spelling.keyboard.type('okhgyi'); await waitAuxComplete(spelling)
    const last = (await readAux(spelling)).attempts.at(-1)
    assert.equal(last.assisted, true); assert.equal(last.independent, false)
    assert.equal((await readAux(spelling)).targets.find(r => r.key === last.targetKey).streak, 0)
  })
  await check('spelling filters modifiers, repeat and IME while native Space activates a hint once', async () => {
    await spelling.getByRole('button', { name: '重置当前字', exact: true }).click(); await blur(spelling)
    await spelling.evaluate(() => {
      for (const options of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }, { isComposing: true }]) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true, ...options }))
    })
    assert.deepEqual(await auxStates(spelling), Array(6).fill('hidden'))
    await spelling.getByRole('button', { name: /查看拼字提示/ }).focus()
    await spelling.keyboard.press('Space')
    assert.deepEqual(await auxStates(spelling), Array(6).fill('hidden'))
    assert.equal(await spelling.locator('.auxiliary-parts').count(), 1)
    assert.equal(await spelling.locator('.auxiliary-parts kbd').count(), 0)
    await spelling.getByRole('button', { name: /查看拼字提示/ }).click()
    await spelling.getByRole('button', { name: /查看拼字提示/ }).click()
    assert.deepEqual(await auxStates(spelling), Array(6).fill('revealed'))
    await audit(spelling, 'spelling-full-hints')
  })
  await check('same-page Inspector blocks typing and preserves an accepted spelling prefix', async () => {
    await spelling.getByRole('button', { name: '重置当前字', exact: true }).click(); await blur(spelling)
    await spelling.keyboard.type('ok')
    await spelling.getByRole('button', { name: '查字与编码', exact: true }).click()
    const before = await auxStates(spelling)
    await spelling.keyboard.type('hgyi')
    assert.deepEqual(await auxStates(spelling), before)
    await spelling.keyboard.press('Escape'); await blur(spelling)
    assert.deepEqual((await auxStates(spelling)).slice(0, 3), ['correct', 'correct', 'hidden'])
  })
  await check('candidate-only spellings are inspectable and cannot enter default scoring', async () => {
    await spelling.getByRole('button', { name: '查字与编码', exact: true }).click()
    await spelling.getByLabel('汉字、拼音或编码', { exact: true }).fill('㐔')
    await spelling.locator('.component-spelling-results[data-status="ready"]').waitFor()
    assert.equal(await spelling.locator('.component-spelling-option[data-confirmed="true"]').count(), 0)
    await spelling.locator('.component-candidates > summary').click()
    assert.match(await spelling.locator('.component-candidates').innerText(), /不进入正式评分/)
    assert.equal(await spelling.getByRole('button', { name: /^练习部件拼字/ }).count(), 0)
    await audit(spelling, 'candidate-only-inspector')
    await spelling.keyboard.press('Escape'); await blur(spelling)
    await openEditor(spelling); await spelling.getByLabel('练习文本', { exact: true }).fill('㐔')
    await spelling.waitForFunction(() => !document.querySelector('.component-data-status[data-status="loading"]'))
    assert.equal(await editor(spelling).locator('button[type="submit"]').isDisabled(), true)
    await spelling.keyboard.press('Escape')
  })
  await check('320px and dark reduced-motion spelling remain readable and accessible', async () => {
    await spelling.setViewportSize({ width: 320, height: 900 })
    await spelling.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await importText(spelling, '𠁳'); await waitAux(spelling)
    await spelling.getByRole('button', { name: /查看拼字提示/ }).click()
    assert.equal(await spelling.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await screenshot(spelling, 'coverage-spelling-320-dark.png'); await audit(spelling, 'spelling-320-dark')
  })

  const retryPage = await createPage()
  await check('a real failed manifest request retains text and retries successfully in the same page', async () => {
    let failed = 0
    retryPage.__qaExpectedFault = true
    await retryPage.route(/component-spelling-manifest[^/]*\.json(?:\?.*)?$/, async route => { failed++; await route.abort() })
    await openEditor(retryPage)
    const original = '𠀂 某\nEnglish retry fixture.'
    await retryPage.getByLabel('练习文本', { exact: true }).fill(original)
    await retryPage.locator('.component-data-status[data-status="error"]').waitFor()
    assert.ok(failed > 0); assert.equal(await retryPage.getByLabel('练习文本', { exact: true }).inputValue(), original)
    assert.equal(await editor(retryPage).locator('button[type="submit"]').isDisabled(), true)
    await audit(retryPage, 'manifest-load-error')
    await retryPage.unroute(/component-spelling-manifest[^/]*\.json(?:\?.*)?$/)
    await retryPage.getByRole('button', { name: '重试加载拼字资料', exact: true }).click()
    await editor(retryPage).locator('button[type="submit"]').click()
    await aux(retryPage).waitFor(); await waitAux(retryPage)
    retryPage.__qaExpectedFault = false
    assert.equal(await retryPage.locator('.text-original').textContent(), original)
    assert.equal(await currentChar(retryPage), '𠀂')
  })
  await check('late dictionary preparation after editor cancellation does not replace the original prefix', async () => {
    const late = await createPage()
    await late.keyboard.type('mz')
    let held
    let release
    const arrived = new Promise(resolve => { held = resolve })
    const gate = new Promise(resolve => { release = resolve })
    await late.route(/component-spelling-manifest[^/]*\.json(?:\?.*)?$/, async route => { held(); await gate; await route.continue() })
    await openEditor(late); await late.getByLabel('练习文本', { exact: true }).fill('𠀂')
    await arrived
    await late.keyboard.press('Escape')
    release()
    await late.waitForLoadState('networkidle')
    assert.equal(await late.locator('.text-context').count(), 0)
    assert.deepEqual(await mainStates(late), ['correct', 'correct', 'hidden', 'hidden'])
    assert.equal(await nav(late).getByRole('button', { name: '自由学习', exact: true }).getAttribute('aria-current'), 'page')
  })

  await check('unavailable auxiliary storage keeps spelling usable without touching four-code records', async () => {
    const memory = await createPage(() => {
      const original = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (name, version) {
        if (name === 'babble-auxiliary-learning-v1') throw new DOMException('QA storage unavailable', 'SecurityError')
        return version === undefined ? original.call(this, name) : original.call(this, name, version)
      }
    })
    await importText(memory, '𠀂'); await waitAux(memory, 'memory-only')
    await memory.keyboard.type('okhgyi'); await waitAuxComplete(memory)
    assert.deepEqual(await auxStates(memory), Array(6).fill('correct'))
    assert.equal(await memory.locator('.auxiliary-storage').getAttribute('data-status'), 'memory-only')
    assert.equal((await readMain(memory)).attempts.length, 0)
    await audit(memory, 'spelling-memory-only')
  })
  await check('an invalid existing auxiliary record is preserved while new attempts stay in memory', async () => {
    const damaged = await createPage()
    const targetKey = (await readAux(spelling)).targets.find(record => record.key.endsWith(':𠀂:OKHGYI')).key
    const original = { key: targetKey, attempts: 'invalid-old-value', streak: 8, everMastered: true }
    await damaged.evaluate(record => new Promise((resolve, reject) => {
      const request = indexedDB.open('babble-auxiliary-learning-v1', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('targets', { keyPath: 'key' })
        request.result.createObjectStore('attempts', { autoIncrement: true })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('targets', 'readwrite')
        tx.objectStore('targets').put(record)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
    }), original)
    await importText(damaged, '𠀂'); await waitAux(damaged, 'memory-only')
    await damaged.keyboard.type('okhgyi'); await waitAuxComplete(damaged)
    assert.equal(await damaged.locator('.auxiliary-storage').getAttribute('data-status'), 'memory-only')
    assert.deepEqual((await readAux(damaged)).targets, [original])
    assert.deepEqual((await readAux(damaged)).attempts, [])
    assert.equal((await readMain(damaged)).attempts.length, 0)
  })

  const local = await createPage()
  const privateArticle = '丨 only this local QA article marker.'
  const localSource = '丨\tabcd\n某\taaaa\n𠀂\tokhgyi\n词语\tciyu\n丨\tabcd\n丶\tab\nA\tazaz\n'
  await check('local TSV preview classifies records and defaults to page-only use', async () => {
    await chooseLibrary(local, 'qa-local.tsv', localSource)
    assert.match(await local.locator('.user-library-preview').innerText(), /3 字、3 条编码/)
    assert.match(await local.locator('.user-library-preview').innerText(), /重复记录/)
    assert.equal(await local.getByLabel('保存在当前浏览器', { exact: true }).isChecked(), false)
    await audit(local, 'user-library-preview')
    await local.getByRole('button', { name: '应用用户字库', exact: true }).click()
    await local.waitForFunction(() => document.querySelector('.user-library-status')?.textContent.includes('已应用'))
    assert.equal((await readUser(local)).libraries.length, 0)
    await closeLibrary(local)
  })
  await check('user code trains in a separate namespace without inferred pronunciation or roots', async () => {
    await importText(local, privateArticle); await aux(local).waitFor(); await waitAux(local)
    // Allow the editor's source preparation to settle before measuring keypresses.
    // A replaced HY prefill can finish its already-started local shard requests.
    await local.waitForLoadState('networkidle')
    const requestStart = requests.length
    assert.equal(await aux(local).getAttribute('data-scheme'), 'user-code')
    assert.match(await local.locator('.pinyin').innerText(), /不推断本字读音/)
    await local.keyboard.type('abcd'); await waitAuxComplete(local)
    const last = (await readAux(local)).attempts.at(-1)
    assert.ok(last.targetKey.startsWith('user-code:sha256:') || last.targetKey.startsWith('user-code:content:'))
    assert.equal(last.code, 'ABCD')
    assert.deepEqual(requests.slice(requestStart), [])
    assert.equal((await readMain(local)).attempts.length, 0)
    assert.equal(JSON.stringify(await readAux(local)).includes(privateArticle), false)
    await audit(local, 'user-code-completed')
  })
  await check('conflicting user keys never silently replace an audited four-code target', async () => {
    await importText(local, '某')
    assert.equal(await aux(local).count(), 0)
    await local.keyboard.type('mzgm'); await waitMain(local)
    assert.deepEqual(await mainStates(local), ['correct', 'correct', 'correct', 'correct'])
    await local.getByRole('button', { name: '查字与编码', exact: true }).click()
    assert.match(await local.locator('.user-code-results').innerText(), /AAAA/)
    assert.match(await local.locator('.inspector-code-summary').innerText(), /MZGM/)
    await local.keyboard.press('Escape')
  })
  await check('page-only user library and article disappear on refresh without being written to storage', async () => {
    await local.reload(); await waitMain(local); await openLibrary(local)
    assert.match(await local.locator('.user-library-current').innerText(), /0 条/)
    assert.equal((await readUser(local)).libraries.length, 0)
    assert.equal(JSON.stringify(await readMain(local)).includes(privateArticle), false)
    await closeLibrary(local)
  })
  await check('explicitly saved local library restores after refresh and can be cleared independently', async () => {
    await applyLibrary(local, 'qa-saved.tsv', localSource, true)
    assert.equal((await readUser(local)).libraries.length, 1)
    await local.reload(); await waitMain(local); await openLibrary(local)
    await local.waitForFunction(() => document.querySelector('.user-library-current')?.textContent.includes('3 条'))
    assert.equal(await local.locator('.text-context').count(), 0)
    await local.getByRole('button', { name: '清除本机用户字库', exact: true }).click()
    await local.waitForFunction(() => document.querySelector('.user-library-current')?.textContent.includes('0 条'))
    assert.equal((await readUser(local)).libraries.length, 0)
    await local.reload(); await waitMain(local); await openLibrary(local)
    assert.match(await local.locator('.user-library-current').innerText(), /0 条/)
    await closeLibrary(local)
  })
  await check('Rime headers are inert data and only its delimited TSV rows are imported', async () => {
    await applyLibrary(local, 'qa-rime.yaml', '---\nname: qa\nevil: !!js/function window.__qaLibraryExecuted=true\n...\n丶\tefgh\t42\n词语\tciyu\t50\n丿\tx\n')
    assert.match(await local.locator('.user-library-current').innerText(), /1 条/)
    assert.equal(await local.evaluate(() => window.__qaLibraryExecuted), undefined)
    await closeLibrary(local)
  })
  await check('official-style personal INI rows are parsed as user codes with word and short-code separation', async () => {
    await applyLibrary(local, 'qa-personal.ini', '[phrase]\nabcd=1,丨\nmzgm=1,某\nokhgyi=1,𠀂\nab=2,丶\nciyu=1,词语\n')
    assert.match(await local.locator('.user-library-current').innerText(), /3 条/)
    await audit(local, 'user-ini-applied')
  })
  await check('invalid UTF-8, malformed Rime, extension and row limits keep the active user library unchanged', async () => {
    const samples = [
      ['qa-invalid.txt', Buffer.from([0xc3, 0x28]), /UTF-8/],
      ['qa-no-data.yaml', Buffer.from('---\nname: no-data\n'), /数据段/],
      ['qa-wrong.csv', Buffer.from('丨,abcd'), /请选择/],
      ['qa-too-many.tsv', Buffer.from('丨\tabcd\n'.repeat(200001)), /200,000/],
    ]
    for (const [name, content, expected] of samples) {
      await chooseLibrary(local, name, content)
      await local.locator('.user-library-status.is-error').waitFor()
      assert.match(await local.locator('.user-library-status').innerText(), expected)
      assert.match(await local.locator('.user-library-current').innerText(), /3 条/)
      assert.equal(await local.getByRole('button', { name: '应用用户字库', exact: true }).count(), 0)
    }
    await audit(local, 'user-library-errors')
  })
  await check('16 MiB byte guard rejects a local library before reading its content', async () => {
    await local.evaluate(() => {
      const original = File.prototype.arrayBuffer
      window.__qaFileReads = []
      File.prototype.arrayBuffer = function () { window.__qaFileReads.push(this.name); return original.call(this) }
    })
    await chooseLibrary(local, 'qa-too-large.tsv', Buffer.alloc(16 * 1024 * 1024 + 1, 0x61))
    await local.locator('.user-library-status.is-error').waitFor()
    assert.match(await local.locator('.user-library-status').innerText(), /16 MiB/)
    assert.equal(await local.evaluate(() => window.__qaFileReads.includes('qa-too-large.tsv')), false)
    assert.match(await local.locator('.user-library-current').innerText(), /3 条/)
    await local.setViewportSize({ width: 320, height: 900 })
    await local.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    assert.equal(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await screenshot(local, 'coverage-local-library-320-dark.png'); await audit(local, 'user-library-320-dark')
    await closeLibrary(local)
  })
  await check('a user code for Unicode18 Extension J trains even when the browser Han table is older', async () => {
    const unicode = await createPage(), char = String.fromCodePoint(0x323b0)
    await applyLibrary(unicode, 'qa-unicode18.tsv', `${char}\tabcd\n`)
    await closeLibrary(unicode)
    await importText(unicode, char); await aux(unicode).waitFor(); await waitAux(unicode)
    assert.equal(await currentChar(unicode), char)
    assert.equal(await aux(unicode).getAttribute('data-scheme'), 'user-code')
    assert.deepEqual(await auxStates(unicode), Array(4).fill('hidden'))
    await unicode.keyboard.type('abcd'); await waitAuxComplete(unicode)
    assert.equal((await readAux(unicode)).attempts.at(-1).char, char)
    assert.equal((await readMain(unicode)).attempts.length, 0)
  })
  await check('clearing an active user code retires it immediately and a failed fallback update can retry', async () => {
    const retired = await createPage(), article = '𠀂 kept local text\nEnglish.'
    await applyLibrary(retired, 'qa-retired.tsv', '𠀂\taaaa\n')
    await closeLibrary(retired); await importText(retired, article); await waitAux(retired)
    assert.equal(await aux(retired).getAttribute('data-scheme'), 'user-code')
    await retired.keyboard.type('a')
    assert.deepEqual(await auxStates(retired), ['correct', 'hidden', 'hidden', 'hidden'])
    retired.__qaExpectedFault = true
    const shard = /component-spelling-080-[^/]+\.json(?:\?.*)?$/
    await retired.route(shard, route => route.abort())
    await openLibrary(retired)
    await retired.getByRole('button', { name: '清除本机用户字库', exact: true }).click()
    await closeLibrary(retired)
    await retired.locator('.component-data-status[data-status="error"]').waitFor()
    assert.equal(await aux(retired).count(), 0)
    assert.match(await retired.locator('.text-pending-training').innerText(), /用户编码.*移除/)
    assert.equal(await retired.locator('.text-original').textContent(), article)
    const partial = (await readAux(retired)).attempts.at(-1)
    assert.equal(partial.code, 'AAAA'); assert.equal(partial.completed, false); assert.equal(partial.typed, 'A')
    await audit(retired, 'retired-user-code-load-error')
    await retired.unroute(shard)
    await retired.getByRole('button', { name: '重试更新文本字库', exact: true }).click()
    await aux(retired).waitFor(); await waitAux(retired)
    retired.__qaExpectedFault = false
    assert.equal(await aux(retired).getAttribute('data-scheme'), 'component-spelling')
    assert.equal(await retired.locator('.component-data-status[data-status="error"]').count(), 0)
    assert.equal(await retired.locator('.text-original').textContent(), article)
    assert.deepEqual(await auxStates(retired), Array(6).fill('hidden'))
    await retired.keyboard.type('okhgyi'); await waitAuxComplete(retired)
    assert.equal((await readMain(retired)).attempts.length, 0)
    assert.equal(JSON.stringify(await readAux(retired)).includes(article), false)
  })

  assert.deepEqual(errors, [], 'No unexpected browser console or page errors')
  assert.equal(requests.some(r => r.method !== 'GET' || r.postData), false, 'No user article/library upload requests')
  passed.push('no unexpected browser errors or upload requests')
} catch (error) {
  failure = String(error?.stack ?? error)
  throw error
} finally {
  await writeFile(new URL('coverage-expansion-smoke.json', output), JSON.stringify({ baseURL, engine, browser: browser.version(), passed, failure, errors, intentionalNetworkFailures, requests }, null, 2) + '\n')
  await writeFile(new URL('coverage-expansion-accessibility.json', output), JSON.stringify(accessibility, null, 2) + '\n')
  for (const context of contexts) await context.close()
  await browser.close()
  console.log('Coverage QA: ' + passed.length + ' checks; ' + accessibility.length + ' axe scans; ' + (failure ? 'FAILED' : 'PASS'))
}
