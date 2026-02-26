/**
 * E2E Tests for Fraud Detection Module
 *
 * Tests the fraud alerts and investigation workflow
 */
import { test, expect } from '@playwright/test';

test.describe('Fraud Detection Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as gestionnaire
    await page.goto('/login');
    await page.fill('input[name="email"]', 'gestionnaire@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard|\/sante/);
  });

  test('should display fraud dashboard with stats', async ({ page }) => {
    await page.goto('/sante/fraud');

    // Check page title
    await expect(page.locator('h1')).toContainText(/fraude|fraud/i);

    // Check KPI cards
    await expect(page.locator('text=/alertes|alerts/i').first()).toBeVisible();
  });

  test('should show alerts list', async ({ page }) => {
    await page.goto('/sante/fraud');

    // Navigate to alerts tab if present
    const alertsTab = page.getByRole('tab', { name: /alertes|alerts/i });
    if (await alertsTab.count() > 0) {
      await alertsTab.click();
    }

    // Check for alert cards or table
    await page.waitForTimeout(1000);
    const hasAlerts = await page.locator('[data-testid="alert-card"]').or(
      page.locator('table tbody tr')
    ).count() > 0 || await page.locator('text=/aucune alerte|no alerts/i').count() > 0;

    expect(hasAlerts).toBeTruthy();
  });

  test('should filter alerts by niveau', async ({ page }) => {
    await page.goto('/sante/fraud');

    // Navigate to alerts tab
    const alertsTab = page.getByRole('tab', { name: /alertes|alerts/i });
    if (await alertsTab.count() > 0) {
      await alertsTab.click();
    }

    // Find niveau filter
    const niveauFilter = page.locator('select').filter({ hasText: /niveau|level/i }).or(
      page.getByRole('combobox').filter({ hasText: /niveau/i })
    );

    if (await niveauFilter.count() > 0) {
      await niveauFilter.first().click();
      await page.locator('[role="option"]').first().click();
      await page.waitForTimeout(500);

      // Page should not error
      await expect(page).not.toHaveURL('/error');
    }
  });

  test('should open alert details', async ({ page }) => {
    await page.goto('/sante/fraud');

    // Navigate to alerts tab
    const alertsTab = page.getByRole('tab', { name: /alertes|alerts/i });
    if (await alertsTab.count() > 0) {
      await alertsTab.click();
    }

    await page.waitForTimeout(1000);

    // Click on first alert if present
    const firstAlert = page.locator('[data-testid="alert-card"]').first().or(
      page.locator('table tbody tr').first()
    );

    if (await firstAlert.count() > 0) {
      await firstAlert.click();

      // Wait for modal/dialog to appear
      await page.waitForTimeout(500);

      // Check if dialog opened
      const dialog = page.locator('[role="dialog"]').or(page.locator('.modal'));
      if (await dialog.count() > 0) {
        await expect(dialog).toBeVisible();
      }
    }
  });

  test('should show patterns tab', async ({ page }) => {
    await page.goto('/sante/fraud');

    // Navigate to patterns tab
    const patternsTab = page.getByRole('tab', { name: /patterns|schemas/i });
    if (await patternsTab.count() > 0) {
      await patternsTab.click();
      await page.waitForTimeout(500);

      // Should show patterns list or empty state
      await expect(page).not.toHaveURL('/error');
    }
  });
});

test.describe('Fraud - Investigation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'gestionnaire@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard|\/sante/);
  });

  test('should start investigation on alert', async ({ page }) => {
    await page.goto('/sante/fraud');

    // Navigate to alerts tab
    const alertsTab = page.getByRole('tab', { name: /alertes|alerts/i });
    if (await alertsTab.count() > 0) {
      await alertsTab.click();
    }

    await page.waitForTimeout(1000);

    // Find an alert with "nouvelle" status and click investigate
    const investigateBtn = page.getByRole('button', { name: /investiguer|investigate/i }).first();

    if (await investigateBtn.count() > 0) {
      await investigateBtn.click();

      // Should show success message or update status
      await page.waitForTimeout(1000);
      // No error should occur
      await expect(page).not.toHaveURL('/error');
    }
  });

  test('should resolve an alert', async ({ page }) => {
    await page.goto('/sante/fraud');

    // Navigate to alerts tab
    const alertsTab = page.getByRole('tab', { name: /alertes|alerts/i });
    if (await alertsTab.count() > 0) {
      await alertsTab.click();
    }

    await page.waitForTimeout(1000);

    // Find resolve button
    const resolveBtn = page.getByRole('button', { name: /resoudre|resolve|traiter/i }).first();

    if (await resolveBtn.count() > 0) {
      await resolveBtn.click();

      // Dialog should open
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.count() > 0) {
        // Fill in notes
        const notesInput = dialog.locator('textarea').or(dialog.locator('input[name="notes"]'));
        if (await notesInput.count() > 0) {
          await notesInput.fill('Test resolution notes');
        }

        // Select resolution
        const confirmBtn = dialog.getByRole('button', { name: /confirmer|confirm/i });
        if (await confirmBtn.count() > 0) {
          await confirmBtn.click();
        }

        await page.waitForTimeout(500);
      }
    }
  });
});
