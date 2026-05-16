import { test, expect } from '@playwright/test';

test('customer can browse events page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/event/i);
});

test('customer homepage loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('body')).toBeVisible();
});