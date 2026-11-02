// Browser-only regression for the reviewed teaching examples. Tools stay outside product dependencies.
// Use the same BROWSER_ENGINE, QA_BASE_URL, QA_OUTPUT_DIR, PLAYWRIGHT_IMPORT and AXE_IMPORT as the other smoke scripts.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createQaBrowser } from './browser-qa.mjs'

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/'
const { browser, engine, output: outputUrl } = await createQaBrowser()
const output = fileURLToPath(outputUrl)
const AxeBuilder = process.env.AXE_IMPORT
  ? (await import(process.env.AXE_IMPORT)).default
  : null
const contexts = [],
  passed = [],
  accessibility = [],
  errors = [],
  records = []
let failure = null
async function createPage() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 1,
  })
  contexts.push(context)
  await context.addInitScript(() => { localStorage.setItem('babble:learning-level', 'yinxing'); localStorage.setItem('xiaohe:auto-hints', 'false') },
  )
  const p = await context.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await p.goto(baseURL)
  await p.waitForLoadState('networkidle')
  await saved(p)
  return p
}
const saved = (p) =>
  p.waitForFunction(
    () => document.querySelector('.storage-status')?.dataset.status === 'saved',
  )
const blur = (p) => p.evaluate(() => document.activeElement?.blur())
const keys = (p) => p.locator('.slot-key').allTextContents()
const card = (p) => p.locator('.shape-explanation')
const check = async (name, run) => {
  await run()
  passed.push(name)
  console.log('PASS', name)
}
const audit = async (p, view) => {
  if (!AxeBuilder) return
  const result = await new AxeBuilder({ page: p })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const violations = result.violations.map(
    ({ id, impact, description, nodes }) => ({
      id,
      impact,
      description,
      nodes: nodes.map(({ target, failureSummary }) => ({
        target,
        failureSummary,
      })),
    }),
  )
  accessibility.push({ view, violations })
  assert.equal(violations.length, 0, view + ' axe violations')
  console.log('AXE', view, violations.length)
}
const dbRead = (p) =>
  p.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('babble-learning-v1', 1)
        r.onerror = () => reject(r.error)
        r.onsuccess = () => {
          const d = r.result,
            t = d.transaction(['state', 'attempts'], 'readonly'),
            s = t.objectStore('state').get('snapshot'),
            a = t.objectStore('attempts').getAll()
          t.oncomplete = () => {
            resolve({ snapshot: s.result, attempts: a.result })
            d.close()
          }
          t.onerror = () => reject(t.error)
        }
      }),
  )
const cases = [
  ['某', 'MZGM', 'root-sequence', ['甘', '木']],
  ['语', 'YUYK', 'root-sequence', ['讠', '五', '口']],
  ['框', 'KLMW', 'root-sequence', ['木', '匚', '王']],
  ['国', 'GOKY', 'root-sequence', ['囗', '玉']],
  ['试', 'UIYG', 'root-sequence', ['讠', '弋', '工']],
  ['中', 'VSLL', 'root-sequence', ['竖', '折', '横', '竖']],
  ['鹤', 'HEDN', 'endpoints', ['点', '左部其余笔画未展开', '鸟']],
  ['木', 'MUUN', 'root-sequence', ['十', '撇', '捺']],
  ['玉', 'YUWD', 'root-sequence', ['王', '点']],
  ['主', 'VUDW', 'root-sequence', ['点', '王']],
  ['元', 'YREE', 'root-sequence', ['二', '儿']],
  ['建', 'JMZY', 'root-sequence', ['廴', '聿']],
  ['健', 'JMRZ', 'endpoints', ['亻', '建中其余部分未展开', '廴']],
]
async function choose(p, char, code) {
  await p.getByLabel('汉字、拼音或编码', { exact: true }).fill(char)
  await p
    .locator('.inspector-reading-choices button')
    .filter({ hasText: code })
    .first()
    .click()
  await card(p).waitFor()
}
try {
  const p = await createPage()
  await check('new teaching stays hidden before disclosure', async () => {
    assert.equal(await card(p).count(), 0)
    assert.deepEqual(await keys(p), ['·', '·', '·', '·'])
  })
  await check(
    'first shape teaching opens inline and keeps accepted prefix',
    async () => {
      await p.keyboard.type('mz')
      await p.locator('.code-slot').nth(2).click()
      assert.deepEqual(await keys(p), ['M', 'Z', '·', '·'])
      assert.equal(
        await card(p).getAttribute('data-teaching-scope'),
        'root-sequence',
      )
      assert.match(await card(p).locator('.is-focused').innerText(), /甘/)
      await p.screenshot({
        path: output + 'completion-inline-first.png',
        fullPage: true,
      })
      await audit(p, 'inline-first')
    },
  )
  await check(
    'last shape focus changes without losing accepted prefix',
    async () => {
      await p.locator('.code-slot').nth(3).click()
      assert.match(await card(p).locator('.is-focused').innerText(), /木/)
      assert.deepEqual(await keys(p), ['M', 'Z', '·', '·'])
      await p.keyboard.press('Escape')
      assert.equal(await card(p).count(), 0)
    },
  )
  await check(
    'Inspector opens on current character and preserves training prefix',
    async () => {
      await p.getByRole('button', { name: '查字与编码', exact: true }).click()
      await choose(p, '某', 'MZGM')
      await p.keyboard.press('Escape')
      await blur(p)
      assert.deepEqual(await keys(p), ['M', 'Z', '·', '·'])
      await p.getByRole('button', { name: '查字与编码', exact: true }).click()
    },
  )
  for (const [char, code, scope, parts] of cases) {
    await check(
      `reviewed teaching ${char} ${code} has honest ${scope} scope`,
      async () => {
        await choose(p, char, code)
        assert.equal(await card(p).getAttribute('data-teaching-scope'), scope)
        assert.deepEqual(
          await card(p)
            .locator('.shape-teaching-parts > li > strong')
            .allTextContents(),
          parts,
        )
        assert.equal(
          await card(p).locator('.shape-teaching-parts > .is-endpoint').count(),
          2,
        )
        assert.match(await card(p).innerText(), /不是逐笔书写动画/)
        if (scope === 'endpoints') {
          assert.equal(await card(p).locator('.is-unexpanded').count(), 1)
          assert.match(await card(p).innerText(), /尚未/)
        } else assert.equal(await card(p).locator('.is-unexpanded').count(), 0)
        await card(p).locator('.shape-teaching-evidence > summary').click()
        assert.ok(
          (await card(p).locator('.shape-teaching-evidence a').count()) >= 3,
        )
        records.push({ char, code, scope, parts })
        if (char === '某') await audit(p, 'inspector-reviewed')
        if (char === '鹤') await audit(p, 'inspector-endpoints')
      },
    )
  }
  await check(
    'all exposed teaching links use HTTPS and safe new-window relation',
    async () => {
      const links = await card(p)
        .locator('a')
        .evaluateAll((els) =>
          els.map((a) => ({ href: a.href, target: a.target, rel: a.rel })),
        )
      assert.ok(links.length > 2)
      for (const l of links) {
        assert.ok(l.href.startsWith('https://'))
        assert.equal(l.target, '_blank')
        assert.ok(l.rel.includes('noreferrer'))
      }
    },
  )
  await check(
    'unreviewed character exposes honest fallback without fabricated sequence',
    async () => {
      await choose(p, '你', 'NIRX')
      assert.equal(
        await card(p).getAttribute('data-teaching-scope'),
        'unreviewed',
      )
      assert.equal(await card(p).locator('.shape-teaching-parts').count(), 0)
      assert.match(await card(p).innerText(), /完整教学分析待补/)
      await audit(p, 'inspector-fallback')
    },
  )
  await check('expanded rules and teaching fit 320px viewport', async () => {
    await p.setViewportSize({ width: 320, height: 900 })
    await choose(p, '某', 'MZGM')
    await card(p).locator('.shape-rule-directory > summary').click()
    assert.equal(
      await card(p).locator('.shape-rule-directory ol > li').count(),
      4,
    )
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    assert.ok(
      await p
        .locator('dialog')
        .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
    )
    await p.screenshot({
      path: output + 'completion-teaching-320.png',
      fullPage: true,
    })
    await audit(p, 'teaching-320')
  })
  await check(
    'dark reduced-motion teaching renders with no accessibility violations',
    async () => {
      await p.setViewportSize({ width: 1440, height: 1050 })
      await p.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
      await choose(p, '玉', 'YUWD')
      assert.equal(
        await p.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
        true,
      )
      assert.match(
        await card(p).locator('.shape-endpoints').innerText(),
        /王.*点/,
      )
      await p.screenshot({
        path: output + 'completion-teaching-dark.png',
        fullPage: true,
      })
      await audit(p, 'teaching-dark')
    },
  )
  const focused = await createPage()
  await focused
    .getByRole('navigation', { name: '学习模式' })
    .getByRole('button', { name: '学习路径', exact: true })
    .click()
  await focused.locator('.path-lesson').nth(7).click()
  await blur(focused)
  await check(
    'provided last-shape slot revealing target explanation is assisted',
    async () => {
      assert.deepEqual(await keys(focused), ['M', 'Z', '·', 'M'])
      await focused.locator('.code-slot').nth(3).click()
      assert.equal(await card(focused).count(), 1)
      await blur(focused)
      await focused.keyboard.type('g')
      await saved(focused)
      const data = await dbRead(focused),
        attempt = data.attempts.at(-1)
      assert.equal(attempt.assisted, true)
      assert.deepEqual(attempt.positions, [2])
      assert.equal(attempt.correct, true)
      assert.equal(data.snapshot.entries['某:MZGM:2'].bestIndependentStreak, 0)
    },
  )
  await check(
    'target shape slot explanation also prevents independent mastery',
    async () => {
      await focused
        .getByRole('button', { name: '重置当前字', exact: true })
        .click()
      await focused.locator('.code-slot').nth(2).click()
      await blur(focused)
      await focused.keyboard.type('g')
      await saved(focused)
      const data = await dbRead(focused)
      assert.equal(data.attempts.at(-1).assisted, true)
      assert.equal(data.snapshot.entries['某:MZGM:2'].bestIndependentStreak, 0)
    },
  )
  assert.deepEqual(errors, [])
} catch (e) {
  failure = e.stack || String(e)
  console.error(failure)
  process.exitCode = 1
} finally {
  await writeFile(
    output + 'completion-teaching.json',
    JSON.stringify(
      {
        baseURL,
        engine,
        browser: browser.version(),
        passed,
        failure,
        errors,
        records,
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile(
    output + 'completion-teaching-accessibility.json',
    JSON.stringify(accessibility, null, 2) + '\n',
  )
  for (const c of contexts) await c.close()
  await browser.close()
}
