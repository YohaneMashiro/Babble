// Actual production Worker + ONNX WASM inference. QA tools stay outside product deps.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createQaBrowser } from './browser-qa.mjs'

const { browser, engine, output } = await createQaBrowser()
const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const passed = [], errors = [], requests = [], accessibility = []
let failure = null
const text = '银行门口的人正在行走。音乐让人快乐。English🙂\n2026'
const check = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
await context.addInitScript(() => {
  localStorage.setItem('babble:learning-level', 'shuangpin')
  localStorage.setItem('xiaohe:auto-hints', 'false')
  window.__g2pwObserved = { loaded: 0, results: [] }
  const NativeWorker = window.Worker
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args)
      this.addEventListener('message', ({ data }) => {
        if (data.type === 'loaded') window.__g2pwObserved.loaded++
        if (data.type === 'result') window.__g2pwObserved.results.push(data.result)
      })
    }
  }
})
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => requests.push({ url: request.url(), method: request.method() }))
const modelRequests = () => requests.filter(r => /models\/g2pw\/|g2pw.worker|ort.*\.(js|mjs|wasm)/.test(r.url))
const editor = () => page.getByRole('dialog', { name: '自定义文本', exact: true })
const field = () => page.getByLabel('练习文本', { exact: true })
const phase = value => page.locator(`.text-annotation-status[data-phase="${value}"]`).waitFor({ timeout: 240_000 })
const current = () => page.locator('.text-character[aria-current="location"]')
async function openEditor() {
  if (await page.locator('.text-context').count()) await page.getByRole('button', { name: '编辑文本', exact: true }).click()
  else await page.getByRole('navigation', { name: '学习模式' }).getByRole('button', { name: '自定义文本', exact: true }).click()
  await editor().waitFor()
}
async function submit() {
  await editor().locator('button[type="submit"]:not(:disabled)').waitFor({ timeout: 240_000 })
  await editor().locator('button[type="submit"]').click()
  await editor().waitFor({ state: 'hidden' })
}
async function audit(view) {
  if (!process.env.AXE_IMPORT) return
  const AxeBuilder = (await import(process.env.AXE_IMPORT)).default
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  accessibility.push({ view, violations: result.violations.map(({ id, impact }) => ({ id, impact })) })
  assert.equal(result.violations.length, 0, `${view}: axe violations`)
}
try {
  await page.goto(baseURL)
  await page.waitForFunction(() => ['saved', 'memory-only'].includes(document.querySelector('.storage-status')?.dataset.status))
  await page.waitForLoadState('networkidle')
  await check('startup, editor, default article and paste do not load the model', async () => {
    assert.equal(modelRequests().length, 0)
    await openEditor(); await phase('preprocessed')
    await field().fill(text); await page.waitForTimeout(400)
    assert.equal(modelRequests().length, 0)
    await page.getByRole('button', { name: '填入《花园中》', exact: true }).click()
    await phase('preprocessed'); await submit()
    await page.locator('.text-character').filter({ hasText: /^中$/ }).first().click()
    assert.equal(await page.locator('.text-automatic-choice').count(), 1)
    assert.equal(await page.locator('.text-automatic-choice').getAttribute('open'), null)
    assert.equal(modelRequests().length, 0)
  })
  const started = performance.now()
  await check('native Upload TXT click starts actual lazy WASM/model loading and annotates locally', async () => {
    await openEditor()
    const chooserPromise = page.waitForEvent('filechooser')
    await editor().locator('input[type="file"]').click()
    const chooser = await chooserPromise
    await chooser.setFiles({ name: 'contextual-example.txt', mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') })
    await phase('annotated')
    const result = await page.evaluate(() => window.__g2pwObserved.results.at(-1))
    assert.equal(result.text, text)
    assert.deepEqual(result.items.map(item => item.char), Array.from(text))
    for (const [index, item] of result.items.entries()) assert.equal(item.index, index)
    const positions = Array.from(text).flatMap((char, index) => char === '行' ? [index] : [])
    assert.deepEqual(positions.map(index => result.items[index].pinyin), ['hang2', 'xing2'])
    assert.ok(result.items.some(item => item.source === 'model'))
    assert.ok(modelRequests().some(r => r.url.endsWith('.bin')))
    assert.equal(await page.evaluate(() => window.__g2pwObserved.loaded), 1)
    await audit('actual-model-ready-editor')
    await submit()
    assert.equal(await page.getByRole('region', { name: '练习原文', exact: true }).textContent(), text)
  })
  console.log(`Actual load + inference: ${((performance.now() - started) / 1000).toFixed(2)}s`)
  await check('automatic pronunciation is editable per occurrence and Space still advances once', async () => {
    const occurrences = page.locator('.text-character').filter({ hasText: /^行$/ })
    await occurrences.first().click()
    assert.match(await page.locator('.text-automatic-choice summary').innerText(), /háng/)
    await page.locator('.text-automatic-choice summary').click()
    await page.getByRole('group', { name: '选择行在此处的读音', exact: true }).getByRole('button', { name: 'xíng', exact: true }).click()
    await occurrences.last().click()
    assert.match(await page.locator('.text-automatic-choice summary').innerText(), /xíng/)
    await occurrences.first().click()
    assert.equal(await page.getByRole('group', { name: '选择行在此处的读音', exact: true }).getByRole('button', { name: 'xíng', exact: true }).getAttribute('aria-pressed'), 'true')
    const index = Number(await current().getAttribute('data-target-index'))
    await page.locator('#practice').focus(); await page.keyboard.type('xk')
    assert.deepEqual(await page.locator('.code-slot').evaluateAll(nodes => nodes.map(node => node.dataset.state)), ['correct', 'correct'])
    await page.keyboard.press('Space')
    await page.waitForFunction(index => document.querySelector('.text-character[aria-current="location"]')?.dataset.targetIndex === String(index + 1), index)
    await page.waitForFunction(() => document.querySelector('.storage-status')?.dataset.status === 'saved')
    const attempts = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('babble-learning-v1', 1)
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('attempts', 'readonly'), rows = tx.objectStore('attempts').getAll()
        tx.oncomplete = () => { db.close(); resolve(rows.result) }
        tx.onerror = () => reject(tx.error)
      }
    }))
    assert.ok(attempts.some(attempt => attempt.char === '行' && attempt.code === 'XK' && attempt.completed && !attempt.assisted))
    await audit('corrected-text-training')
  })
  await check('edited text cancels stale work and reuses the loaded session without downloads', async () => {
    const requestCount = modelRequests().length
    await openEditor(); await field().fill(text.repeat(10))
    await page.waitForTimeout(300)
    await field().fill('行走。银行。🙂ABC')
    await phase('annotated')
    await submit()
    assert.equal(await page.getByRole('region', { name: '练习原文', exact: true }).textContent(), '行走。银行。🙂ABC')
    assert.equal(await page.evaluate(() => window.__g2pwObserved.loaded), 1)
    assert.equal(modelRequests().length, requestCount)
  })
  await check('switching between the two learning levels reuses the model and preserves text sessions', async () => {
    const requestCount = modelRequests().length
    await page.getByRole('group', { name: '选择学习级别' }).getByRole('button', { name: /小鹤音形/ }).click()
    await page.waitForFunction(() => ['saved', 'memory-only'].includes(document.querySelector('.storage-status')?.dataset.status))
    await openEditor(); await phase('annotated'); await submit()
    assert.equal(await page.locator('.code-slot').count(), 4)
    assert.equal(await page.getByRole('region', { name: '练习原文', exact: true }).textContent(), '行走。银行。🙂ABC')
    await page.getByRole('group', { name: '选择学习级别' }).getByRole('button', { name: /小鹤双拼/ }).click()
    await page.getByRole('navigation', { name: '学习模式' }).getByRole('button', { name: '自定义文本', exact: true }).click()
    assert.equal(await page.locator('.code-slot').count(), 2)
    assert.equal(await page.getByRole('region', { name: '练习原文', exact: true }).textContent(), '行走。银行。🙂ABC')
    assert.equal(await page.evaluate(() => window.__g2pwObserved.loaded), 1)
    assert.equal(modelRequests().length, requestCount)
  })
  await check('all model requests stay on this origin and original texts are absent from persistent stores', async () => {
    assert.ok(requests.every(r => new URL(r.url).origin === new URL(baseURL).origin && r.method === 'GET'))
    const stores = await page.evaluate(async () => {
      const values = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]
      for (const info of await indexedDB.databases()) {
        const db = await new Promise((resolve, reject) => { const req = indexedDB.open(info.name); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
        for (const name of db.objectStoreNames) values.push(JSON.stringify(await new Promise((resolve, reject) => { const req = db.transaction(name).objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })))
        db.close()
      }
      return values.join('\n')
    })
    assert.ok(!stores.includes(text) && !stores.includes('行走。银行。🙂ABC'))
    const previous = modelRequests().length
    await page.reload(); await page.waitForLoadState('networkidle'); await openEditor(); await phase('preprocessed')
    assert.equal(modelRequests().length, previous)
    assert.notEqual(await field().inputValue(), '行走。银行。🙂ABC')
  })
  assert.deepEqual(errors, [])
} catch (error) { failure = { message: error.message, stack: error.stack }; console.error(error); process.exitCode = 1 }
finally {
  await page.screenshot({ path: new URL('g2pw-final.png', output).pathname, fullPage: true }).catch(() => {})
  await writeFile(new URL('g2pw-smoke.json', output), JSON.stringify({ engine, passed, accessibility, errors, failure, modelRequestCount: modelRequests().length }, null, 2) + '\n')
  await browser.close()
}
