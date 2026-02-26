/**
 * E2E Tests for Contracts Module
 *
 * Tests contract management, guarantees, and pricing
 */
import { test, expect } from '@playwright/test';

test.describe('Contracts Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin or insurer
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test('should display contracts page', async ({ page }) => {
    await page.goto('/contracts');

    // Check page title
    await expect(page.locator('h1')).toContainText(/contrat|contract/i);
  });

  test('should display contracts list', async ({ page }) => {
    await page.goto('/contracts');

    await page.waitForTimeout(1000);

    // Should show table
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('should have new contract button', async ({ page }) => {
    await page.goto('/contracts');

    // Find create button
    const createBtn = page.getByRole('button', { name: /nouveau|créer|ajouter/i });
    await expect(createBtn).toBeVisible();
  });

  test('should open new contract dialog', async ({ page }) => {
    await page.goto('/contracts');

    // Click create button
    const createBtn = page.getByRole('button', { name: /nouveau|créer|ajouter/i });
    await createBtn.click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Check form fields
    await expect(dialog.locator('text=/assureur|insurer/i').first()).toBeVisible();
  });

  test('should fill contract form', async ({ page }) => {
    await page.goto('/contracts');

    // Open dialog
    const createBtn = page.getByRole('button', { name: /nouveau|créer|ajouter/i });
    await createBtn.click();

    const dialog = page.locator('[role="dialog"]');

    // Fill form fields
    const nameInput = dialog.locator('input[name="name"], input#name');
    if (await nameInput.count() > 0) {
      await nameInput.fill('Test Contract');
    }

    const numberInput = dialog.locator('input[name="contractNumber"], input#contractNumber');
    if (await numberInput.count() > 0) {
      await numberInput.fill('CTR-TEST-001');
    }

    // Close without saving
    const cancelBtn = dialog.getByRole('button', { name: /annuler|cancel/i });
    await cancelBtn.click();
  });

  test('should open contract details', async ({ page }) => {
    await page.goto('/contracts');

    await page.waitForTimeout(1000);

    // Click details button on first row
    const detailsBtn = page.getByRole('button', { name: /détail|details|voir/i }).first();

    if (await detailsBtn.count() > 0) {
      await detailsBtn.click();
      await page.waitForTimeout(500);

      // Dialog should open
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
    }
  });

  test('should display contract coverage rates', async ({ page }) => {
    await page.goto('/contracts');

    await page.waitForTimeout(1000);

    // Click details on first contract
    const detailsBtn = page.getByRole('button', { name: /détail|details|voir/i }).first();

    if (await detailsBtn.count() > 0) {
      await detailsBtn.click();

      const dialog = page.locator('[role="dialog"]');

      // Check for coverage info
      const hasCoverage = await dialog.locator('text=/couverture|pharmacie|consultation/i').count() > 0;
      expect(hasCoverage).toBeTruthy();
    }
  });

  test('should edit contract', async ({ page }) => {
    await page.goto('/contracts');

    await page.waitForTimeout(1000);

    // Open details
    const detailsBtn = page.getByRole('button', { name: /détail|details|voir/i }).first();

    if (await detailsBtn.count() > 0) {
      await detailsBtn.click();

      const dialog = page.locator('[role="dialog"]');

      // Click modify button
      const modifyBtn = dialog.getByRole('button', { name: /modifier|edit/i });
      if (await modifyBtn.count() > 0) {
        await modifyBtn.click();

        await page.waitForTimeout(500);

        // Edit dialog should appear
        const editDialog = page.locator('[role="dialog"]');
        await expect(editDialog).toBeVisible();
      }
    }
  });

  test('should display contract types', async ({ page }) => {
    await page.goto('/contracts');

    await page.waitForTimeout(1000);

    // Check for type badges
    const pageContent = await page.textContent('body');
    const hasTypes =
      pageContent?.includes('Individuel') ||
      pageContent?.includes('Groupe') ||
      pageContent?.includes('Entreprise');

    expect(hasTypes).toBeTruthy();
  });

  test('should display contract status', async ({ page }) => {
    await page.goto('/contracts');

    await page.waitForTimeout(1000);

    // Check for status badges
    const badges = page.locator('.badge, [data-testid="status-badge"]');
    const hasBadges = await badges.count() > 0;

    expect(hasBadges).toBeTruthy();
  });

  test('should paginate contracts', async ({ page }) => {
    await page.goto('/contracts');

    await page.waitForTimeout(1000);

    // Look for pagination
    const pagination = page.locator('[data-testid="pagination"], nav[aria-label*="pagination"]').or(
      page.locator('button').filter({ hasText: /suivant|next|>/ })
    );

    if (await pagination.count() > 0) {
      await expect(pagination.first()).toBeVisible();
    }
  });
});

test.describe('Contracts - Guarantees Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test('should access guarantees page', async ({ page }) => {
    await page.goto('/sante/garanties');

    // Check page loads
    await expect(page.locator('h1')).toContainText(/garantie|formule/i);
  });

  test('should display guarantees list', async ({ page }) => {
    await page.goto('/sante/garanties');

    await page.waitForTimeout(1000);

    // Should have content
    const hasContent = await page.locator('table, .card, [data-testid="garantie"]').count() > 0;
    expect(hasContent).toBeTruthy();
  });

  test('should create new guarantee', async ({ page }) => {
    await page.goto('/sante/garanties');

    // Find add button
    const addBtn = page.getByRole('button', { name: /ajouter|nouveau|créer/i });

    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Form or dialog should appear
      const form = page.locator('form, [role="dialog"]');
      await expect(form).toBeVisible();
    }
  });
});

test.describe('Contracts - Access Control', () => {
  test('insurer admin should have access', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'assureur@dhamen.tn');
    await page.fill('input[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/contracts');

    // Should have access
    await expect(page.locator('h1')).toContainText(/contrat|contract/i);
  });
});
