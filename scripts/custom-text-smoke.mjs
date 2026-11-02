// Browser-only QA; Playwright and axe remain outside application dependencies.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createQaBrowser } from './browser-qa.mjs'

const AxeBuilder = process.env.AXE_IMPORT ? (await import(process.env.AXE_IMPORT)).default : null
const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const initialText = await readFile(new URL('../the_Tower_of_Babel.txt', import.meta.url), 'utf8')
assert.equal(createHash('sha256').update(initialText).digest('hex'), 'b8bca40fef81749ed547a6f0ac12a29519b8b24162fe5d003a31ed33214cdac3', 'the_Tower_of_Babel.txt must match the independently extracted DOCX paragraphs exactly')
const { browser, engine, output } = await createQaBrowser()
const contexts = []
const passed = []
const accessibility = []
const errors = []
const requests = []
const screenshots = []
let failure = null

const check = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
const nav = page => page.getByRole('navigation', { name: '学习模式' })
const blur = page => page.evaluate(() => document.activeElement?.blur())
const states = page => page.locator('.code-slot').evaluateAll(elements => elements.map(element => element.getAttribute('data-state')))
const currentChar = page => page.locator('.character-inspect-button').innerText()
const textDialog = page => page.getByRole('dialog', { name: '自定义文本', exact: true })
// Source preparation is asynchronous; file decoding alone no longer means
// that the submitted text's fallback dictionary has finished preparing.
const waitSubmit = page => textDialog(page).locator('button[type="submit"]:not(:disabled)').waitFor()
const waitSaved = page => page.waitForFunction(() => document.querySelector('.storage-status')?.getAttribute('data-status') === 'saved')
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
  await page.waitForTimeout(200) // Allow the existing 160ms color transitions to settle in exported screenshots.
  await page.screenshot({ path: new URL(name, output).pathname, fullPage: true })
  screenshots.push(name)
}
const audit = async (page, view) => {
  if (!AxeBuilder) return
  // Wait for the existing 160ms button/color transitions after async readiness.
  await page.waitForTimeout(200)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = result.violations.map(({ id, impact, description, nodes }) => ({ id, impact, description, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))
  accessibility.push({ view, violations })
  console.log(`AXE ${view}: ${violations.length} issue classes`)
}
async function createPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  contexts.push(context)
  await context.addInitScript(() => { localStorage.setItem('babble:learning-level', 'yinxing'); localStorage.setItem('xiaohe:auto-hints', 'false') })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => requests.push(request.url()))
  await page.goto(baseURL)
  await page.waitForLoadState('networkidle')
  await waitSaved(page)
  return page
}
async function openEditor(page) {
  if (await textDialog(page).count()) return
  if (await page.locator('.text-context').count()) await page.getByRole('button', { name: '编辑文本', exact: true }).click()
  else await nav(page).getByRole('button', { name: '自定义文本', exact: true }).click()
  await textDialog(page).waitFor()
}
async function importText(page, text) {
  await openEditor(page)
  await page.getByLabel('练习文本', { exact: true }).fill(text)
  await textDialog(page).locator('button[type="submit"]').click()
  await page.locator('.text-context').waitFor()
  await blur(page)
}
async function jump(page, index) {
  await page.locator(`.text-character[data-target-index="${index}"]`).click()
  await blur(page)
}

try {
  const page = await createPage()
  await check('the supplied HY text is prefilled exactly, paginates losslessly and respects replacement and clear actions', async () => {
    const initialPage = await createPage()
    assert.equal(await nav(initialPage).getByRole('button', { name: '自由学习', exact: true }).getAttribute('aria-current'), 'page')
    await openEditor(initialPage)
    assert.equal(await initialPage.getByLabel('练习文本', { exact: true }).inputValue(), initialText)
    assert.equal(Array.from(initialText).length, 2197)
    assert.equal(initialText.split('\n').length, 65)
    assert.ok(initialText.startsWith('花园中\n'))
    assert.equal(await textDialog(initialPage).locator('button[type="submit"]').innerText(), '开始练习')
    await capture(initialPage, 'phase5-hy-editor.png')
    await audit(initialPage, 'hy-initial-editor')
    await textDialog(initialPage).locator('button[type="submit"]').click()
    await initialPage.locator('.text-context').waitFor()
    const pages = initialPage.getByLabel('原文页码', { exact: true })
    const pageCount = await pages.locator('option').count()
    assert.ok(pageCount > 1)
    const sourceChunks = []
    for (let index = 0; index < pageCount; index++) {
      await pages.selectOption(String(index))
      sourceChunks.push(await initialPage.locator('.text-original').textContent())
      assert.ok(await initialPage.locator('.text-character[data-target-index]').count() <= 400)
    }
    assert.equal(sourceChunks.join(''), initialText)
    await initialPage.getByRole('button', { name: '回到当前字', exact: true }).click()
    await capture(initialPage, 'phase5-hy-initial-text.png')
    await audit(initialPage, 'hy-initial-text')
    await importText(initialPage, '某某\nEnglish remains 2026.')
    await openEditor(initialPage)
    assert.equal(await initialPage.getByLabel('练习文本', { exact: true }).inputValue(), '某某\nEnglish remains 2026.')
    await initialPage.keyboard.press('Escape')
    await initialPage.getByRole('button', { name: '清除文本', exact: true }).click()
    assert.equal(await initialPage.getByLabel('练习文本', { exact: true }).inputValue(), '')
    await initialPage.keyboard.press('Escape')
    await openEditor(initialPage)
    assert.equal(await initialPage.getByLabel('练习文本', { exact: true }).inputValue(), '', 'an explicit clear must remain empty in this page session')
    await initialPage.getByRole('button', { name: '填入《花园中》', exact: true }).click()
    assert.equal(await initialPage.getByLabel('练习文本', { exact: true }).inputValue(), initialText)
    await initialPage.keyboard.press('Escape')
  })

  const uploadPage = await createPage()
  // Prepare the bundled default article through its normal flow first. This
  // separates one-time dictionary loading from the local file-I/O boundary.
  await openEditor(uploadPage)
  await textDialog(uploadPage).locator('button[type="submit"]').click()
  await uploadPage.locator('.text-context').waitFor()
  await openEditor(uploadPage)
  const uploadRequestStart = requests.length
  const uploadedText = '某你好！\nHello, Babble 2026.\nEnglish words stay exactly as written.\n'
  await check('local UTF-8 TXT upload preserves Chinese, English, punctuation and line breaks', async () => {
    await openEditor(uploadPage)
    await uploadPage.getByLabel('上传 TXT 文件', { exact: true }).setInputFiles({ name: 'practice.TXT', mimeType: 'text/plain', buffer: Buffer.from(uploadedText, 'utf8') })
    await uploadPage.waitForFunction(value => document.querySelector('.text-editor textarea')?.value === value, uploadedText)
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), uploadedText)
    await waitSubmit(uploadPage)
    await audit(uploadPage, 'txt-upload-ready')
    await textDialog(uploadPage).locator('button[type="submit"]').click()
    assert.equal(await uploadPage.locator('.text-original').textContent(), uploadedText)
    await openEditor(uploadPage)
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), uploadedText)
  })

  await check('invalid, oversized and over-limit TXT files retain the current text and report clear errors', async () => {
    const input = uploadPage.getByLabel('上传 TXT 文件', { exact: true })
    const error = uploadPage.locator('.text-editor-upload-status.is-error')
    const atLimit = '某' + '😀'.repeat(19999)
    await input.setInputFiles({ name: 'at-limit-with-bom.txt', mimeType: 'text/plain', buffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(atLimit, 'utf8')]) })
    await uploadPage.waitForFunction(value => document.querySelector('.text-editor textarea')?.value === value, atLimit)
    await waitSubmit(uploadPage)
    assert.equal(await textDialog(uploadPage).locator('button[type="submit"]').isEnabled(), true)
    await uploadPage.getByLabel('练习文本', { exact: true }).fill(uploadedText)
    await uploadPage.evaluate(() => {
      window.__qaOriginalArrayBuffer = File.prototype.arrayBuffer
      window.__qaFileReads = []
      File.prototype.arrayBuffer = function () { window.__qaFileReads.push(this.name); return window.__qaOriginalArrayBuffer.call(this) }
    })
    await input.setInputFiles({ name: 'too-many.txt', mimeType: 'text/plain', buffer: Buffer.from('某'.repeat(20001), 'utf8') })
    await error.waitFor()
    assert.match(await error.innerText(), /20,000|20000/)
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), uploadedText)
    await input.setInputFiles({ name: 'too-large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(80004, 0x61) })
    await error.waitFor()
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), uploadedText)
    assert.equal(await uploadPage.evaluate(() => window.__qaFileReads.includes('too-large.txt')), false, 'byte limit must reject before reading the file')
    await input.setInputFiles({ name: 'wrong-extension.csv', mimeType: 'text/csv', buffer: Buffer.from('某,Hello\n') })
    await error.waitFor()
    assert.match(await error.innerText(), /TXT|\.txt|txt/)
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), uploadedText)
    await input.setInputFiles({ name: 'invalid-utf8.txt', mimeType: 'text/plain', buffer: Buffer.from([0xc3, 0x28]) })
    await error.waitFor()
    assert.match(await error.innerText(), /UTF.?8/i)
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), uploadedText)
    await audit(uploadPage, 'txt-upload-error')
    await uploadPage.evaluate(() => { File.prototype.arrayBuffer = window.__qaOriginalArrayBuffer })
  })

  await check('later file selections, manual edits and the supplied text take precedence over pending TXT reads', async () => {
    const input = uploadPage.getByLabel('上传 TXT 文件', { exact: true })
    await uploadPage.evaluate(() => {
      window.__qaOriginalArrayBuffer = File.prototype.arrayBuffer
      window.__qaReleaseReads = {}
      File.prototype.arrayBuffer = function () {
        const file = this
        if (!file.name.startsWith('qa-late-')) return window.__qaOriginalArrayBuffer.call(file)
        return new Promise((resolve, reject) => { window.__qaReleaseReads[file.name] = () => window.__qaOriginalArrayBuffer.call(file).then(value => { resolve(value) }, reject) })
      }
    })
    const release = async name => uploadPage.evaluate(async value => { await window.__qaReleaseReads[value](); await new Promise(resolve => setTimeout(resolve, 0)) }, name)
    await input.setInputFiles({ name: 'qa-late-first.txt', mimeType: 'text/plain', buffer: Buffer.from('某 old file') })
    assert.equal(await textDialog(uploadPage).locator('button[type="submit"]').isDisabled(), true)
    await input.setInputFiles({ name: 'qa-current.txt', mimeType: 'text/plain', buffer: Buffer.from('某 newest file\nEnglish 2026.') })
    await uploadPage.waitForFunction(() => document.querySelector('.text-editor textarea')?.value === '某 newest file\nEnglish 2026.')
    await release('qa-late-first.txt')
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), '某 newest file\nEnglish 2026.')
    await input.setInputFiles({ name: 'qa-late-edit.txt', mimeType: 'text/plain', buffer: Buffer.from('某 old file edit') })
    await uploadPage.getByLabel('练习文本', { exact: true }).fill('某 manual edit\nEnglish stays.')
    await release('qa-late-edit.txt')
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), '某 manual edit\nEnglish stays.')
    await waitSubmit(uploadPage)
    assert.equal(await textDialog(uploadPage).locator('button[type="submit"]').isEnabled(), true)
    await input.setInputFiles({ name: 'qa-late-sample.txt', mimeType: 'text/plain', buffer: Buffer.from('某 old file sample') })
    await uploadPage.getByRole('button', { name: '填入《花园中》', exact: true }).click()
    await release('qa-late-sample.txt')
    assert.equal(await uploadPage.getByLabel('练习文本', { exact: true }).inputValue(), initialText)
    await waitSubmit(uploadPage)
    assert.equal(await textDialog(uploadPage).locator('button[type="submit"]').isEnabled(), true)
    await uploadPage.evaluate(() => { File.prototype.arrayBuffer = window.__qaOriginalArrayBuffer })
    await uploadPage.keyboard.press('Escape')
    assert.deepEqual(requests.slice(uploadRequestStart), [], 'local TXT selection and decoding must perform no network requests')
  })

  await check('custom text editor validates empty, literal-only and unsupported-only input explicitly', async () => {
    await openEditor(page)
    await page.getByLabel('练习文本', { exact: true }).fill('')
    assert.equal(await textDialog(page).locator('button[type="submit"]').isDisabled(), true)
    await page.getByLabel('练习文本', { exact: true }).fill('Babble 2026, !')
    await page.waitForFunction(() => document.querySelector('.text-editor-status')?.textContent.includes('没有可练习'))
    assert.match(await page.locator('.text-editor-status').innerText(), /没有可练习/)
    assert.equal(await textDialog(page).locator('button[type="submit"]').isDisabled(), true)
    await page.getByLabel('练习文本', { exact: true }).fill('丨丶丿乀')
    // Observe this input's lazy preparation before asserting its final availability.
    await page.locator('.component-data-status[data-status="loading"]').waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.querySelector('.text-editor-status')?.textContent.includes('没有可练习') && !document.querySelector('.component-data-status'))
    assert.match(await page.locator('.text-editor-status').innerText(), /没有可练习/)
    assert.equal(await textDialog(page).locator('button[type="submit"]').isDisabled(), true)
    await audit(page, 'editor-unsupported')
    await page.keyboard.press('Escape')
  })

  await check('editing and cancelling leave the active training prefix intact', async () => {
    await blur(page)
    await page.keyboard.type('mz')
    const before = await states(page)
    await openEditor(page)
    await page.getByLabel('练习文本', { exact: true }).fill('某某')
    await page.keyboard.type('mzgm')
    assert.deepEqual(await states(page), before)
    await page.keyboard.press('Escape')
    assert.deepEqual(await states(page), ['correct', 'correct', 'hidden', 'hidden'])
    assert.equal(await currentChar(page), '某')
  })

  // These retain the unavailable-input negative case after the former rare
  // fixtures gained compared component spellings in the new layer.
  const original = '某，丨丶丿乀。\n你好！行行重重；Babble 2026.'
  await check('import preserves original punctuation, Latin text and unavailable Han without inventing codes', async () => {
    await importText(page, original)
    assert.equal(await page.locator('.text-original').textContent(), original)
    assert.equal(await nav(page).getByRole('button', { name: '自定义文本', exact: true }).getAttribute('aria-current'), 'page')
    assert.equal(await currentChar(page), '某')
    assert.equal(await page.locator('.text-character[aria-current="location"]').innerText(), '某')
    assert.equal(await page.locator('.text-character.is-unavailable').count(), 4)
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    assert.match(await page.locator('.text-context-summary').innerText(), /4 个(?:缺少取形|暂无可用编码)/)
    await capture(page, 'phase5-custom-text.png')
    await audit(page, 'custom-text')
  })

  await check('unavailable character Inspector returns to the original occurrence and prefix', async () => {
    await page.keyboard.type('mz')
    await page.locator('.text-character.is-unavailable').filter({ hasText: '丨' }).click()
    await page.getByRole('dialog', { name: '查字与编码', exact: true }).waitFor()
    assert.match(await page.locator('.inspector-detail').innerText(), /取形数据尚未收录|取形.*尚未收录|暂不提供四码训练/)
    await page.keyboard.type('gm')
    assert.deepEqual(await states(page), ['correct', 'correct', 'hidden', 'hidden'])
    await page.keyboard.press('Escape')
    assert.equal(await currentChar(page), '某')
    assert.deepEqual(await states(page), ['correct', 'correct', 'hidden', 'hidden'])
    await page.keyboard.type('gm')
    await waitSaved(page)
    const last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.char, '某')
    assert.equal(last.code, 'MZGM')
    assert.equal(last.assisted, false, 'looking up another unavailable character reveals no current-target answer')
    // Native dialog restores focus to its invoking button in Firefox. Test the
    // global Enter shortcut after leaving that button's own activation context.
    await blur(page)
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '你')
    assert.match(await page.locator('.text-character[aria-current="location"]').getAttribute('aria-label'), /第 2 个/)
  })

  await check('occurrence jumps replace the target and preserve original text highlighting', async () => {
    await jump(page, 0)
    assert.equal(await currentChar(page), '某')
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    await jump(page, 2)
    assert.equal(await currentChar(page), '好')
    assert.equal(await page.locator('.text-character[aria-current="location"]').getAttribute('data-target-index'), '2')
  })

  await check('polyphonic occurrences wait for explicit independent reading choices', async () => {
    await jump(page, 3)
    assert.equal(await page.locator('.text-reading-options button[aria-pressed="true"]').count(), 0)
    assert.equal(await page.locator('.code-slots').count(), 0)
    await page.keyboard.type('xkii')
    assert.equal(await page.locator('.code-slots').count(), 0)
    assert.equal(await page.locator('.text-reading-options').innerText().then(text => /XKII|HHII|HGII/.test(text)), false)
    await audit(page, 'polyphonic-pending')
    await page.locator('.text-reading-options button').filter({ has: page.locator('span').filter({ hasText: /^xíng$/ }) }).click()
    await blur(page)
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    assert.match(await page.locator('.pinyin').innerText(), /xíng/)
    await page.keyboard.type('xkii')
    await waitSaved(page)
    let last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.char, '行')
    assert.equal(last.fullCode, 'XKII')
    assert.equal(last.assisted, false)
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('.code-slots').count(), 0, 'same character next occurrence requires its own choice')
    await page.locator('.text-reading-options button').filter({ has: page.locator('span').filter({ hasText: /^háng$/ }) }).click()
    await blur(page)
    await page.keyboard.type('hhii')
    await waitSaved(page)
    last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.fullCode, 'HHII')
    await jump(page, 3)
    assert.match(await page.locator('.pinyin').innerText(), /xíng/)
    assert.equal(await page.locator('.text-reading-options button[aria-pressed="true"]').innerText(), 'xíng')
    await jump(page, 4)
    assert.match(await page.locator('.pinyin').innerText(), /háng/)
  })

  await check('wrong input and hints use the existing complete-code attempt semantics', async () => {
    await jump(page, 0)
    const requestStart = requests.length
    await page.keyboard.type('mzj')
    assert.deepEqual(await states(page), ['correct', 'correct', 'incorrect', 'hidden'])
    assert.match(await page.locator('.feedback').innerText(), /第 3 码/)
    await page.keyboard.type('gm')
    await waitSaved(page)
    let last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.code, 'MZJGM')
    assert.equal(last.wrongPosition, 2)
    assert.equal(last.correct, false)
    await page.keyboard.press('Backspace')
    await page.getByRole('button', { name: '查看当前字提示', exact: true }).click()
    await page.keyboard.type('mzgm')
    await waitSaved(page)
    last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.hintLevelUsed, 1)
    assert.equal(last.assisted, true)
    assert.deepEqual(last.positions, [0, 1, 2, 3])
    assert.deepEqual(requests.slice(requestStart), [], 'typing, feedback and local progress perform no network requests')
  })

  await check('import, reading choices and original-character jumps return focus to physical training', async () => {
    await openEditor(page)
    await page.getByLabel('练习文本', { exact: true }).fill('某行某')
    await textDialog(page).locator('button[type="submit"]').click()
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'practice')
    await page.keyboard.type('mzgm')
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '行')
    const hang = page.locator('.text-reading-options button').filter({ has: page.locator('span').filter({ hasText: /^háng$/ }) })
    await hang.click()
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'practice')
    await page.keyboard.type('hhii')
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '某')
    assert.match(await page.locator('.sample-label').innerText(), /3\s*\/\s*3/)
    await page.locator('.text-character[data-target-index="0"]').click()
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'practice')
    await page.keyboard.type('mzgm')
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '行')
    await hang.click() // Reselecting the same option must also restore training focus.
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'practice')
    await page.keyboard.type('hhii')
    await page.keyboard.press('Enter')
    assert.match(await page.locator('.sample-label').innerText(), /3\s*\/\s*3/)
  })

  await check('searching from an unavailable-character Inspector to the active character records assistance', async () => {
    await importText(page, '某丨某')
    await page.keyboard.type('mz')
    await page.locator('.text-character.is-unavailable').click()
    await page.getByRole('dialog', { name: '查字与编码', exact: true }).waitFor()
    await page.getByLabel('汉字、拼音或编码', { exact: true }).fill('某')
    await page.locator('.inspector-code-summary').waitFor()
    assert.match(await page.locator('.inspector-code-summary').innerText(), /MZGM/)
    await page.keyboard.press('Escape')
    assert.deepEqual(await states(page), ['correct', 'correct', 'hidden', 'hidden'])
    await blur(page)
    await page.keyboard.type('gm')
    await waitSaved(page)
    const last = (await dbRead(page)).attempts.at(-1)
    assert.equal(last.char, '某')
    assert.equal(last.code, 'MZGM')
    assert.equal(last.assisted, true)
    assert.equal(last.hintLevelUsed, 4)
  })

  await check('custom article and selected readings stay in page memory while single-character attempts persist', async () => {
    await waitSaved(page)
    const data = await dbRead(page)
    assert.equal(JSON.stringify(data).includes('Babble 2026.'), false)
    assert.equal(JSON.stringify(data).includes(original), false)
    assert.equal(JSON.stringify(data.snapshot).includes('targetIndex'), false)
    assert.ok(data.attempts.some(attempt => attempt.char === '行' && attempt.fullCode === 'HHII'))
    await page.reload()
    await waitSaved(page)
    assert.equal(await page.locator('.text-context').count(), 0)
    await openEditor(page)
    assert.equal(await page.getByLabel('练习文本', { exact: true }).inputValue(), initialText, 'reload clears the user article and offers the supplied initial text')
    await page.keyboard.press('Escape')
    const restored = await dbRead(page)
    assert.equal(restored.attempts.length, data.attempts.length)
  })

  await check('a source reading without a matching code remains lookup-only and skips without a fake attempt', async () => {
    await importText(page, '某洗某')
    await jump(page, 1)
    const before = (await dbRead(page)).attempts.length
    await page.locator('.text-reading-options button').filter({ has: page.locator('span').filter({ hasText: /^xiǎn$/ }) }).click()
    await blur(page)
    assert.equal(await page.locator('.code-slots').count(), 0)
    assert.match(await page.locator('.text-reading-choice').innerText(), /此读音尚无可靠四码/)
    await page.keyboard.type('xide')
    assert.equal(await page.locator('.code-slots').count(), 0)
    await page.keyboard.press('Enter')
    assert.equal(await currentChar(page), '某')
    assert.match(await page.locator('.sample-label').innerText(), /3\s*\/\s*3/)
    await waitSaved(page)
    assert.equal((await dbRead(page)).attempts.length, before)
    await audit(page, 'reading-only-skipped')
  })

  await check('twenty-thousand Unicode codepoints are accepted and overflow is rejected without truncation', async () => {
    await openEditor(page)
    const astralAtLimit = '某' + '😀'.repeat(19999)
    await page.getByLabel('练习文本', { exact: true }).fill(astralAtLimit)
    assert.match(await page.locator('.text-editor-count').innerText(), /20,000 \/ 20,000/)
    await waitSubmit(page)
    assert.equal(await textDialog(page).locator('button[type="submit"]').isEnabled(), true)
    const tooLong = astralAtLimit + '😀'
    await page.getByLabel('练习文本', { exact: true }).fill(tooLong)
    assert.match(await page.locator('.text-editor-status').innerText(), /内容没有被截断/)
    assert.equal(await page.getByLabel('练习文本', { exact: true }).inputValue(), tooLong)
    assert.equal(await textDialog(page).locator('button[type="submit"]').isDisabled(), true)
    await audit(page, 'editor-over-limit')
    await page.getByLabel('练习文本', { exact: true }).fill('某'.repeat(2001))
    await page.waitForFunction(() => /长文本.*分页/.test(document.querySelector('.text-editor-status')?.textContent ?? '') && !document.querySelector('.component-data-status'))
    await waitSubmit(page)
    assert.match(await page.locator('.text-editor-status').innerText(), /长文本.*分页/)
    assert.equal(await textDialog(page).locator('button[type="submit"]').isEnabled(), true)
    await page.keyboard.press('Escape')
  })

  const longText = 'START Babble\n' + '某，'.repeat(801) + '\nEND 2026.'
  await check('long text pages preserve every source codepoint and browsing never changes the training occurrence', async () => {
    await importText(page, longText)
    assert.equal(await page.getByLabel('原文页码', { exact: true }).locator('option').count(), 3)
    const chunks = []
    for (let index = 0; index < 3; index++) {
      await page.getByLabel('原文页码', { exact: true }).selectOption(String(index))
      chunks.push(await page.locator('.text-original').textContent())
      assert.ok(await page.locator('.text-character[data-target-index]').count() <= 400)
      assert.equal(await currentChar(page), '某')
      assert.match(await page.locator('.sample-label').innerText(), /1\s*\/\s*801/)
    }
    assert.equal(chunks.join(''), longText)
    await page.getByRole('button', { name: '回到当前字', exact: true }).click()
    assert.equal(await page.getByLabel('原文页码', { exact: true }).inputValue(), '0')
    await page.locator('.text-character[data-target-index="398"]').evaluate(element => element.click())
    await blur(page)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => {
      const region = document.querySelector('.text-original').getBoundingClientRect()
      const current = document.querySelector('.text-character[aria-current="location"]').getBoundingClientRect()
      return current.top >= region.top && current.bottom <= region.bottom
    })
    await page.getByLabel('原文页码', { exact: true }).selectOption('2')
    await jump(page, 800)
    assert.equal(await page.getByLabel('原文页码', { exact: true }).inputValue(), '2')
    assert.equal(await page.locator('.text-character[aria-current="location"]').getAttribute('data-target-index'), '800')
    await audit(page, 'long-text-last-page')
  })

  await check('last partial attempt is finalized once when ending the text round', async () => {
    const before = (await dbRead(page)).attempts.length
    await page.keyboard.type('m')
    await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor()
    await waitSaved(page)
    let data = await dbRead(page)
    assert.equal(data.attempts.length, before + 1)
    assert.equal(data.attempts.at(-1).code, 'M')
    assert.equal(data.attempts.at(-1).completed, false)
    await audit(page, 'text-round-ended')
    await page.keyboard.press('Escape')
    await blur(page)
    await page.keyboard.type('mzgm')
    await waitSaved(page)
    data = await dbRead(page)
    assert.equal(data.attempts.length, before + 2)
    assert.equal(data.attempts.at(-1).code, 'MZGM')
    assert.equal(data.attempts.at(-1).completed, true)
  })

  await check('switching away and returning retains only the custom text occurrence and reading choice', async () => {
    await importText(page, '某行某')
    await jump(page, 1)
    await page.locator('.text-reading-options button').filter({ has: page.locator('span').filter({ hasText: /^háng$/ }) }).click()
    await blur(page)
    await page.keyboard.type('hh')
    await nav(page).getByRole('button', { name: '自由学习', exact: true }).click()
    await nav(page).getByRole('button', { name: '自定义文本', exact: true }).click()
    await blur(page)
    assert.equal(await currentChar(page), '行')
    assert.match(await page.locator('.pinyin').innerText(), /háng/)
    assert.deepEqual(await states(page), ['hidden', 'hidden', 'hidden', 'hidden'])
    assert.match(await page.locator('.sample-label').innerText(), /2\s*\/\s*3/)
  })

  await check('mobile editor, current text and pending reading fit 375px and 320px', async () => {
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 })
      await importText(page, original)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await capture(page, `phase5-text-mobile-${width}.png`)
      await audit(page, `text-mobile-${width}`)
      await jump(page, 3)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await audit(page, `text-pending-mobile-${width}`)
      await openEditor(page)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await capture(page, `phase5-editor-mobile-${width}.png`)
      await audit(page, `text-editor-mobile-${width}`)
      await page.keyboard.press('Escape')
    }
  })

  await check('dark text, reading selector and editor retain readable contrast with reduced motion', async () => {
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await importText(page, original)
    await capture(page, 'phase5-text-dark.png')
    await audit(page, 'text-dark')
    await jump(page, 3)
    await audit(page, 'text-pending-dark')
    await openEditor(page)
    await audit(page, 'text-editor-dark')
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
    await page.keyboard.press('Escape')
  })

  await check('clearing the custom text removes article and reading choices', async () => {
    await page.getByRole('button', { name: '清除文本', exact: true }).click()
    assert.equal(await page.locator('.text-context').count(), 0)
    await openEditor(page)
    assert.equal(await page.getByLabel('练习文本', { exact: true }).inputValue(), '')
    await page.keyboard.press('Escape')
  })

  assert.deepEqual(errors, [], 'no browser console or page errors')
  passed.push('no browser console or page errors')
  assert.deepEqual(accessibility.flatMap(view => view.violations.map(item => `${view.view}: ${item.id}`)), [], 'axe scans must be clean')
} catch (error) {
  failure = String(error?.stack ?? error)
  throw error
} finally {
  await writeFile(new URL('custom-text-smoke.json', output), JSON.stringify({ baseURL, engine, browser: await browser.version(), passed, failure, errors, screenshots }, null, 2) + '\n')
  await writeFile(new URL('custom-text-accessibility.json', output), JSON.stringify(accessibility, null, 2) + '\n')
  for (const context of contexts) await context.close()
  await browser.close()
  console.log(`Custom-text QA: ${passed.length} checks; ${accessibility.length} axe scans; ${failure ? 'FAILED' : 'PASS'}`)
}
