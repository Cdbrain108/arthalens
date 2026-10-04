import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/research/history', route => route.fulfill({ json: [] }))
  await page.route('**/api/agents', route => route.fulfill({ json: [
    { name: 'financial', description: 'Collect company statements and compute ratios from available inputs.', tools: ['get_financials'], status: 'configured' },
    { name: 'news', description: 'Collect relevant news with publication dates and source links.', tools: ['search_news'], status: 'configured' },
  ] }))
})

test('intro is animated, skippable, session-scoped and restores focus', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.intro-skip')).toBeVisible()
  const transform = await page.locator('.intro-bull').evaluate(el => getComputedStyle(el).transform)
  await page.waitForTimeout(300)
  expect(await page.locator('.intro-bull').evaluate(el => getComputedStyle(el).transform)).not.toBe(transform)
  await page.keyboard.press('Escape')
  await expect(page.locator('.entry-intro')).toHaveCount(0)
  await expect(page.locator('#research-query')).toBeFocused()
  await page.reload()
  await expect(page.locator('#research-query')).toBeVisible()
  await expect(page.locator('.entry-intro')).toHaveCount(0)
})

test('reduced motion, both themes and all target widths are accessible without overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.entry-intro')).toHaveCount(0, { timeout: 3000 })
  await expect(page.getByRole('heading', { name: 'financial', exact: true })).toBeVisible()
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click()
    for (const [width, height] of [[360,800],[390,844],[768,1024],[1024,768],[1280,900],[1440,900],[1920,1080],[844,390]]) {
      await page.setViewportSize({ width, height })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${theme} ${width} overflow`).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  }
})

test('demo controls, theme persistence, and research submission work', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('bullseye:intro:v1', 'seen'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Research TCS', exact: true }).click()
  await expect(page.locator('#research-query')).toHaveValue('Research TCS')
  await page.getByRole('button', { name: '↘ Bear case', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What could break the thesis?' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
  await page.route('**/api/research', async route => {
    expect(route.request().postDataJSON().query).toBe('AAPL')
    await route.fulfill({ json: { job_id: 'test-job' } })
  })
  await page.route('**/api/research/test-job/status', route => route.fulfill({ json: { job_id: 'test-job', query: 'AAPL', status: 'failed', error: 'Test provider unavailable', steps: [] } }))
  await page.locator('#research-query').fill('AAPL')
  await page.getByRole('button', { name: 'Research', exact: true }).click()
  await expect(page).toHaveURL(/#chat$/)
  await expect(page.locator('.be-landing')).toHaveCount(0)
})
