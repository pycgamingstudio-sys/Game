import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#loading-screen').waitFor({ state: 'detached', timeout: 20000 });
});

test('loads the 3D scene and opens the main menu', async ({ page }) => {
  await expect(page.locator('#main-menu')).toHaveClass(/active/);
  await expect(page.locator('#canvas-container canvas')).toBeVisible();
  await expect(page.locator('#quality-select')).toHaveValue('ultra');
});

test('starts, pauses and resumes a drive', async ({ page }) => {
  await page.locator('#start-button').click();
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.locator('#pause-button').click();
  await expect(page.locator('#pause-screen')).toHaveClass(/active/);
  await page.locator('#resume-button').click();
  await expect(page.locator('#pause-screen')).toHaveClass(/hidden/);
});

test('graphics quality can be changed without reloading', async ({ page }) => {
  await page.locator('#quality-select').selectOption('balanced');
  await expect(page.locator('#quality-select')).toHaveValue('balanced');
  await page.locator('#quality-select').selectOption('performance');
  await expect(page.locator('#quality-select')).toHaveValue('performance');
});

test('keyboard throttle produces measurable speed', async ({ page }) => {
  await page.locator('#start-button').click();
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  const speed = Number(await page.locator('#speed-value').textContent());
  expect(speed).toBeGreaterThan(0);
});

test('mobile layout exposes touch pedals', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#brake-button')).toBeVisible();
  await expect(page.locator('#boost-button')).toBeVisible();
});
