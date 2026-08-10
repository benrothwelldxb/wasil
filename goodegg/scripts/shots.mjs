import { chromium } from 'playwright-core'
import { resolve } from 'node:path'

const OUT = resolve(process.cwd(), 'screenshots')
const exec =
  process.env.PW_CHROMIUM ||
  '/opt/pw-browsers/chromium/chrome-linux/chrome'

const routes = [
  ['landing', '/'],
  ['home-reveal', '/app'],
  ['reveal', '/app/reveal'],
  ['buddy', '/app/buddy'],
  ['ideas', '/app/ideas'],
  ['ask', '/app/ask'],
  ['messages', '/app/messages'],
  ['missions', '/app/missions'],
  ['profile', '/app/profile'],
  ['settings', '/app/settings'],
  ['create', '/create'],
]
const wideRoutes = [
  ['hq', '/hq'],
  ['hq-participants', '/hq/participants'],
]

const browser = await chromium.launch({ executablePath: exec })
try {
  // Phone viewport
  const phone = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 })
  const page = await phone.newPage()
  for (const [name, path] of routes) {
    await page.goto('http://localhost:4173' + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    if (name === 'reveal') {
      const btn = page.getByRole('button', { name: /reveal my buddy/i })
      if (await btn.count()) {
        await btn.first().click()
        await page.waitForTimeout(1200)
      }
    }
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log('shot', name)
  }
  await phone.close()

  // Desktop viewport for organiser
  const desk = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const dpage = await desk.newPage()
  for (const [name, path] of wideRoutes) {
    await dpage.goto('http://localhost:4173' + path, { waitUntil: 'networkidle' })
    await dpage.waitForTimeout(500)
    await dpage.screenshot({ path: `${OUT}/${name}.png` })
    console.log('shot', name)
  }
  await desk.close()

  // Capture any console errors on home
  const errs = []
  const c2 = await browser.newContext({ viewport: { width: 402, height: 874 } })
  const p2 = await c2.newPage()
  p2.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  p2.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
  await p2.goto('http://localhost:4173/app', { waitUntil: 'networkidle' })
  await p2.waitForTimeout(800)
  console.log('CONSOLE_ERRORS', JSON.stringify(errs, null, 2))
} finally {
  await browser.close()
}
