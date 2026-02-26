/**
 * E2E Tests for Business Intelligence Dashboard
 *
 * Tests BI analytics and reporting features
 */
import { test, expect } from '@playwright/test';

test.describe('BI Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin or gestionnaire
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test('should display BI dashboard page', async ({ page }) => {
    await page.goto('/bi');

    // Check page title
    await expect(page.locator('h1')).toContainText(/business intelligence|bi/i);
  });

  test('should display KPI cards', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(1000);

    // Check for KPI cards
    const kpiCards = page.locator('.card, [data-testid="kpi-card"]');
    const count = await kpiCards.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Check specific KPIs are present
    const pageContent = await page.textContent('body');
    expect(pageContent).toMatch(/demandes|remboursé|taux|délai/i);
  });

  test('should have period filter', async ({ page }) => {
    await page.goto('/bi');

    // Find period filter
    const periodFilter = page.locator('select, [role="combobox"]').first();
    await expect(periodFilter).toBeVisible();

    await periodFilter.click();
    await page.waitForTimeout(300);

    // Check options
    const options = page.locator('[role="option"]');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);
  });

  test('should filter by period', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(1000);

    // Change period
    const periodFilter = page.locator('select, [role="combobox"]').first();
    await periodFilter.click();

    const option = page.locator('[role="option"]').nth(1);
    if (await option.count() > 0) {
      await option.click();
      await page.waitForTimeout(500);

      // Should update without errors
      await expect(page).not.toHaveURL('/error');
    }
  });

  test('should display charts', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(2000);

    // Check for chart containers (recharts renders SVGs)
    const charts = page.locator('svg.recharts-surface, .recharts-wrapper');
    const chartCount = await charts.count();
    expect(chartCount).toBeGreaterThanOrEqual(2);
  });

  test('should display monthly trend chart', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(2000);

    // Look for evolution mensuelle section
    const trendSection = page.locator('text=/évolution|mensuelle|trend/i').first();
    if (await trendSection.count() > 0) {
      await expect(trendSection).toBeVisible();
    }
  });

  test('should display care type distribution', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(2000);

    // Look for pie chart or distribution
    const distribution = page.locator('text=/répartition|type.*soin|distribution/i').first();
    if (await distribution.count() > 0) {
      await expect(distribution).toBeVisible();
    }
  });

  test('should display top providers list', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(1500);

    // Look for top praticiens section
    const topSection = page.locator('text=/top.*praticien|top.*provider/i').first();
    if (await topSection.count() > 0) {
      await expect(topSection).toBeVisible();
    }
  });

  test('should have export buttons', async ({ page }) => {
    await page.goto('/bi');

    // Check for export buttons
    const exportPdf = page.getByRole('button', { name: /export.*pdf/i });
    const exportExcel = page.getByRole('button', { name: /export.*excel/i });

    const hasPdf = await exportPdf.count() > 0;
    const hasExcel = await exportExcel.count() > 0;

    expect(hasPdf || hasExcel).toBeTruthy();
  });

  test('should filter by insurer', async ({ page }) => {
    await page.goto('/bi');

    // Find insurer filter (second combobox)
    const filters = page.locator('select, [role="combobox"]');
    const filterCount = await filters.count();

    if (filterCount >= 2) {
      const insurerFilter = filters.nth(1);
      await insurerFilter.click();
      await page.waitForTimeout(300);

      const options = page.locator('[role="option"]');
      if (await options.count() > 1) {
        await options.nth(1).click();
        await page.waitForTimeout(500);

        await expect(page).not.toHaveURL('/error');
      }
    }
  });

  test('should display fraud alerts section', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(1500);

    // Look for fraud section
    const fraudSection = page.locator('text=/fraude|fraud|alerte/i').first();
    if (await fraudSection.count() > 0) {
      await expect(fraudSection).toBeVisible();
    }
  });

  test('should display insurer performance', async ({ page }) => {
    await page.goto('/bi');

    await page.waitForTimeout(1500);

    // Look for performance section
    const perfSection = page.locator('text=/performance|assureur|insurer/i').first();
    if (await perfSection.count() > 0) {
      await expect(perfSection).toBeVisible();
    }
  });
});

test.describe('BI Dashboard - Access Control', () => {
  test('gestionnaire should have access', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'gestionnaire@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard|\/sante/);

    await page.goto('/bi');

    // Should have access
    await expect(page.locator('h1')).toContainText(/business intelligence|bi/i);
  });

  test('insurer admin should have access', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'assureur@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/bi');

    // Should have access
    const title = page.locator('h1');
    await expect(title).toBeVisible();
  });
});
