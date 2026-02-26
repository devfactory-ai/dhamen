/**
 * E2E Tests for Analytics Dashboard
 *
 * Tests the advanced analytics features
 */
import { test, expect } from '@playwright/test';

test.describe('Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as gestionnaire
    await page.goto('/login');
    await page.fill('input[name="email"]', 'gestionnaire@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard|\/sante/);
  });

  test('should display analytics page with charts', async ({ page }) => {
    await page.goto('/sante/analytics');

    // Check page title
    await expect(page.locator('h1')).toContainText('Analytics');

    // Check KPI cards are present
    await expect(page.locator('[data-testid="kpi-card"]').or(page.locator('.grid > div').first())).toBeVisible();

    // Check tabs are present
    await expect(page.getByRole('tab', { name: /apercu|overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /tendances|trends/i })).toBeVisible();
  });

  test('should switch between time periods', async ({ page }) => {
    await page.goto('/sante/analytics');

    // Find period selector
    const periodSelector = page.locator('select').filter({ hasText: /semaine|mois|trimestre/i }).or(
      page.getByRole('combobox')
    );

    if (await periodSelector.count() > 0) {
      await periodSelector.first().click();
      await page.locator('[role="option"]').first().click();

      // Chart should update (page should not error)
      await expect(page).not.toHaveURL('/error');
    }
  });

  test('should navigate between tabs', async ({ page }) => {
    await page.goto('/sante/analytics');

    // Click on different tabs
    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();

    for (let i = 0; i < tabCount; i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(500);
      // Verify no error occurred
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });
});

test.describe('Analytics - Role-based access', () => {
  test('admin should have full access', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@dhamen.tn');
    await page.fill('input[name="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/sante/analytics');
    await expect(page).toHaveURL('/sante/analytics');
  });

  test('provider should not have access to analytics', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'pharmacien@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Try to access analytics
    await page.goto('/sante/analytics');

    // Should redirect or show access denied
    const url = page.url();
    const hasAnalytics = url.includes('/sante/analytics');

    if (hasAnalytics) {
      // If still on page, check for access denied message
      const body = await page.locator('body').textContent();
      expect(body).toMatch(/access|denied|autorisation|interdit/i);
    }
  });
});
